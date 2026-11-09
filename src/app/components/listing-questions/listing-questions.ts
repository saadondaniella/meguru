import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  required,
  requiredError,
  validate,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ListingStatus } from '../../models/listing';
import {
  ANSWER_MAX_LENGTH,
  answerQuestionErrorMessage,
  askQuestionErrorMessage,
  ListingQuestion,
  QUESTION_MAX_LENGTH,
  QUESTIONS_INITIAL_PAGE_SIZE,
  QUESTIONS_PAGE_SIZE,
} from '../../models/listing-question';
import { Auth } from '../../services/auth';
import { ListingQuestionsService } from '../../services/listing-questions';

// Dates read like "9 Nov 2026". Intl is used instead of Angular's DatePipe,
// which would add about 12 kB of date formatting code to the initial bundle.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Public Q&A of a listing. Anyone can read it, signed-in visitors who are not
// the seller can ask a question, and the seller can reply to (and edit the
// reply to) each question. Askers are always shown as "MEGURU member".
@Component({
  imports: [FormField, RouterLink],
  selector: 'app-listing-questions',
  templateUrl: './listing-questions.html',
  styleUrl: './listing-questions.css',
})
export class ListingQuestions {
  private questionsService = inject(ListingQuestionsService);
  private auth = inject(Auth);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  readonly listingId = input.required<string>();
  readonly status = input<ListingStatus>('published');
  // The owner of the listing. Sellers do not get the question form.
  readonly sellerId = input<string | null>(null);

  // Draft listings expose no Q&A, so nothing is requested or shown.
  readonly isVisible = computed(() => this.status() !== 'draft');
  readonly isSold = computed(() => this.status() === 'sold');

  readonly questions = signal<ListingQuestion[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingMore = signal(false);
  readonly loadError = signal(false);
  readonly loadMoreError = signal(false);
  // Read by screen readers after "Show more" (a polite live region).
  readonly announcement = signal('');

  // Number of questions on the listing, as reported by the database.
  private readonly total = signal(0);
  // How many rows have been fetched so far. This is the next page offset. It
  // can differ from questions().length when a row shows up twice because new
  // questions arrived between two requests (those duplicates are dropped).
  private readonly nextOffset = signal(0);

  // How many of the loaded questions are on screen. "Show less" lowers it
  // back to the first page, and the questions stay loaded, so "Show more" can
  // bring them back without another request.
  private readonly visibleCount = signal(QUESTIONS_INITIAL_PAGE_SIZE);

  readonly visibleQuestions = computed(() => this.questions().slice(0, this.visibleCount()));

  // Loaded questions that are currently collapsed.
  private readonly hasHidden = computed(() => this.questions().length > this.visibleCount());

  readonly hasMore = computed(() => this.hasHidden() || this.nextOffset() < this.total());

  readonly canShowLess = computed(
    () => this.visibleQuestions().length > QUESTIONS_INITIAL_PAGE_SIZE,
  );

  // ASKING A QUESTION

  readonly isLoggedIn = this.auth.isLoggedIn;
  private readonly currentUserId = signal<string | null>(null);
  // False while we still look up who is signed in, so the seller never sees
  // the form flash up before we know they own the listing.
  private readonly isUserResolved = signal(false);

  readonly isOwner = computed(() => {
    const sellerId = this.sellerId();
    const userId = this.currentUserId();

    return !!sellerId && !!userId && sellerId === userId;
  });

  // Only published listings take questions, never from their own seller.
  // Visitors who are not signed in get the button too: it asks them to log in.
  readonly canAsk = computed(
    () => this.status() === 'published' && this.isUserResolved() && !this.isOwner(),
  );

  readonly maxLength = QUESTION_MAX_LENGTH;

  private readonly questionModel = signal({ question: '' });

  // Signal form. The database checks the same rules again.
  readonly questionForm = form(this.questionModel, (path) => {
    required(path.question);
    validate(path.question, ({ value }) =>
      value().trim().length === 0 ? requiredError() : undefined,
    );
    maxLength(path.question, QUESTION_MAX_LENGTH);
  });

  readonly isFormOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly showLoginPrompt = signal(false);
  readonly showSuccess = signal(false);
  private readonly submitAttempted = signal(false);

  readonly questionLength = computed(() => this.questionForm.question().value().length);

  // Shown once the field was touched (or a submit was tried), never on a fresh form.
  readonly fieldError = computed(() => {
    const field = this.questionForm.question();

    if (!field.touched() && !this.submitAttempted()) return '';

    const errors = field.errors();

    if (errors.some((error) => error.kind === 'required')) {
      return 'Write your question before posting it.';
    }

    if (errors.some((error) => error.kind === 'maxLength')) {
      return `Your question can be at most ${QUESTION_MAX_LENGTH} characters.`;
    }

    return '';
  });

  // REPLYING (the seller)

  readonly maxAnswerLength = ANSWER_MAX_LENGTH;

  // Only the owner of a published listing gets the reply controls. The
  // database checks again who may reply and when.
  readonly canReply = computed(
    () => this.status() === 'published' && this.isUserResolved() && this.isOwner(),
  );

  private readonly replyModel = signal({ reply: '' });

  // Signal form of the single reply form that can be open. The database
  // checks the same rules again.
  readonly replyForm = form(this.replyModel, (path) => {
    required(path.reply);
    validate(path.reply, ({ value }) =>
      value().trim().length === 0 ? requiredError() : undefined,
    );
    maxLength(path.reply, ANSWER_MAX_LENGTH);
  });

  // The question whose reply form is open. Only one form is open at a time.
  readonly replyingToId = signal<string | null>(null);
  readonly isSavingReply = signal(false);
  readonly replyError = signal('');
  private readonly replySubmitAttempted = signal(false);
  // "Reply posted" or "Reply updated", shown under the question that changed.
  readonly replyNotice = signal<{ id: string; text: string } | null>(null);

  readonly replyLength = computed(() => this.replyForm.reply().value().length);

  readonly replyFieldError = computed(() => {
    const field = this.replyForm.reply();

    if (!field.touched() && !this.replySubmitAttempted()) return '';

    const errors = field.errors();

    if (errors.some((error) => error.kind === 'required')) {
      return 'Write your reply before saving it.';
    }

    if (errors.some((error) => error.kind === 'maxLength')) {
      return `Your reply can be at most ${ANSWER_MAX_LENGTH} characters.`;
    }

    return '';
  });

  private readonly askToggle = viewChild<ElementRef<HTMLButtonElement>>('askToggle');
  private readonly questionInput = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');
  private readonly successClose = viewChild<ElementRef<HTMLButtonElement>>('successClose');
  private readonly loginDialog = viewChild<ElementRef<HTMLElement>>('loginDialog');

  // Incremented whenever the listing changes. A response that belongs to an
  // older generation is ignored, so stale data never reaches the screen.
  private generation = 0;
  private userRequest = 0;

  constructor() {
    effect(() => {
      const listingId = this.listingId();
      const isVisible = this.isVisible();

      untracked(() => {
        this.resetAskState();
        void this.loadFirstPage(listingId, isVisible);
      });
    });

    // Find out who is signed in (to recognise the seller) and close the form
    // when they sign out.
    effect(() => {
      const isLoggedIn = this.isLoggedIn();

      untracked(() => {
        void this.resolveUser(isLoggedIn);
      });
    });

    // A reply form never stays open when the person may no longer reply (they
    // signed out, or the listing was sold).
    effect(() => {
      if (!this.canReply()) {
        untracked(() => {
          this.closeReply();
          this.replyNotice.set(null);
        });
      }
    });

    // Move focus into the popups as soon as they appear.
    effect(() => {
      this.successClose()?.nativeElement.focus();
    });

    effect(() => {
      this.loginDialog()?.nativeElement.querySelector<HTMLElement>('a, button')?.focus();
    });
  }

  retry() {
    void this.loadFirstPage(this.listingId(), this.isVisible());
  }

  formatDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    const parts = Object.fromEntries(
      DATE_FORMAT.formatToParts(date).map((part) => [part.type, part.value]),
    );

    return `${parts['day']} ${parts['month']} ${parts['year']}`;
  }

  // REPLY TO A QUESTION (the seller)

  isReplying(questionId: string): boolean {
    return this.canReply() && this.replyingToId() === questionId;
  }

  // The visible text is just "REPLY" or "EDIT REPLY", so each button also names
  // the question it belongs to for screen readers. The visible words come first.
  replyLabel(item: ListingQuestion): string {
    const preview = item.question.length > 60 ? `${item.question.slice(0, 60)}…` : item.question;

    return `${item.answer ? 'Edit reply' : 'Reply'} to the question: ${preview}`;
  }

  // Opens the reply form under a question, with the current reply filled in
  // when there is one. Opening a form closes any other one, and pressing the
  // same button again closes it.
  openReply(item: ListingQuestion) {
    // A reply that is still being saved has to finish first.
    if (this.isSavingReply() || !this.canReply()) return;

    if (this.replyingToId() === item.id) {
      this.cancelReply();
      return;
    }

    this.closeReply();
    this.replyNotice.set(null);
    this.replyModel.set({ reply: item.answer ?? '' });
    this.replyForm.reply().reset();
    this.replyingToId.set(item.id);

    afterNextRender(
      () => {
        this.host.nativeElement
          .querySelector<HTMLTextAreaElement>(`[data-reply-input="${item.id}"]`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  cancelReply() {
    // Closing while a request is running would hide its result.
    if (this.isSavingReply()) return;

    const id = this.replyingToId();

    this.closeReply();

    if (id) {
      afterNextRender(
        () => {
          this.host.nativeElement
            .querySelector<HTMLElement>(`[data-reply-button="${id}"]`)
            ?.focus();
        },
        { injector: this.injector },
      );
    }
  }

  async submitReply(event: Event) {
    event.preventDefault();

    // aria-disabled keeps focus on the button, so a second click or press is
    // ignored here. This is what prevents duplicate replies.
    if (this.isSavingReply()) return;

    const id = this.replyingToId();
    const item = this.questions().find((question) => question.id === id);

    if (!id || !item || !this.canReply()) return;

    const field = this.replyForm.reply();

    this.replySubmitAttempted.set(true);
    field.markAsTouched();

    if (field.invalid()) {
      this.host.nativeElement
        .querySelector<HTMLTextAreaElement>(`[data-reply-input="${id}"]`)
        ?.focus();
      return;
    }

    const listingId = this.listingId();
    const wasEdit = !!item.answer;

    this.isSavingReply.set(true);
    this.replyError.set('');

    const { data, error } = await this.questionsService.answerQuestion(id, field.value().trim());

    // The visitor moved to another listing while the reply was saving.
    if (listingId !== this.listingId()) return;

    this.isSavingReply.set(false);

    if (error || !data) {
      // The form stays open with the text, so nothing the seller wrote is lost.
      console.error('Error saving reply:', error);
      this.replyError.set(answerQuestionErrorMessage(error));
      return;
    }

    // Show the saved reply at once, with the timestamps the database returned:
    // the date of the first reply never changes, and "Edited" appears when an
    // existing reply was changed.
    this.questions.update((current) =>
      current.map((question) =>
        question.id === data.id
          ? {
              ...question,
              answer: data.answer,
              answered_at: data.answered_at,
              answer_updated_at: data.answer_updated_at,
            }
          : question,
      ),
    );

    this.closeReply();

    const text = wasEdit ? 'Reply updated' : 'Reply posted';

    this.replyNotice.set({ id, text });
    this.announcement.set(`${text}.`);
    this.focusQuestion(id);
  }

  private closeReply() {
    this.replyModel.set({ reply: '' });
    this.replyForm.reply().reset();
    this.replyingToId.set(null);
    this.replyError.set('');
    this.replySubmitAttempted.set(false);
  }

  // ASK A QUESTION

  toggleForm() {
    // Visitors who are not signed in are asked to log in instead.
    if (!this.isLoggedIn()) {
      this.showLoginPrompt.set(true);
      return;
    }

    const willOpen = !this.isFormOpen();

    this.isFormOpen.set(willOpen);
    this.submitError.set('');

    if (willOpen) {
      afterNextRender(() => this.questionInput()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  cancel() {
    this.clearForm();
    this.isFormOpen.set(false);
    this.askToggle()?.nativeElement.focus();
  }

  async submit(event: Event) {
    event.preventDefault();

    // aria-disabled keeps focus on the button, so a second click or press is
    // ignored here. This is what prevents duplicate questions.
    if (this.isSubmitting()) return;

    if (!this.isLoggedIn()) {
      this.showLoginPrompt.set(true);
      return;
    }

    const field = this.questionForm.question();

    this.submitAttempted.set(true);
    field.markAsTouched();

    if (field.invalid()) {
      this.questionInput()?.nativeElement.focus();
      return;
    }

    const listingId = this.listingId();

    this.isSubmitting.set(true);
    this.submitError.set('');

    const { error } = await this.questionsService.askQuestion(listingId, field.value().trim());

    // The visitor moved to another listing while the question was posting.
    if (listingId !== this.listingId()) return;

    this.isSubmitting.set(false);

    if (error) {
      console.error('Error posting question:', error);
      this.submitError.set(askQuestionErrorMessage(error));
      return;
    }

    this.clearForm();
    this.isFormOpen.set(false);
    this.showSuccess.set(true);

    // Show the new question at the top of the list.
    void this.refresh();
  }

  closeSuccess() {
    this.showSuccess.set(false);
    this.askToggle()?.nativeElement.focus();
  }

  closeLoginPrompt() {
    this.showLoginPrompt.set(false);
    this.askToggle()?.nativeElement.focus();
  }

  // Escape closes the login prompt, and Tab stays inside it.
  onLoginPromptKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeLoginPrompt();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = this.loginDialog()?.nativeElement;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async showMore() {
    // aria-disabled keeps focus on the button, so clicks are ignored here.
    if (this.isLoadingMore() || !this.hasMore()) return;

    // After "Show less", the next questions are already loaded: show them
    // again without a request.
    if (this.hasHidden()) {
      const shown = this.visibleCount();
      const next = Math.min(shown + QUESTIONS_PAGE_SIZE, this.questions().length);

      this.visibleCount.set(next);
      this.announceMore(next - shown);
      this.focusQuestion(this.questions()[shown].id);
      return;
    }

    const generation = this.generation;
    const offset = this.nextOffset();

    this.isLoadingMore.set(true);
    this.loadMoreError.set(false);

    const { data, error } = await this.questionsService.getQuestions(
      this.listingId(),
      QUESTIONS_PAGE_SIZE,
      offset,
    );

    // The visitor moved to another listing while this request was running.
    if (generation !== this.generation) return;

    this.isLoadingMore.set(false);

    if (error || !data) {
      console.error('Error loading more questions:', error);
      this.loadMoreError.set(true);
      return;
    }

    const known = new Set(this.questions().map((question) => question.id));
    const fresh = data.questions.filter((question) => !known.has(question.id));

    this.questions.update((current) => [...current, ...fresh]);
    // Nothing was collapsed while loading, so everything loaded is shown.
    this.visibleCount.set(this.questions().length);
    this.nextOffset.set(offset + data.questions.length);

    // An empty page means no rows are left (some were removed meanwhile), so
    // stop offering "Show more" instead of repeating the same request.
    this.total.set(data.questions.length === 0 ? offset : data.total);

    if (fresh.length > 0) {
      this.announceMore(fresh.length);
      this.focusQuestion(fresh[0].id);
    }
  }

  // Back to the first page. The loaded questions are kept, so nothing is
  // requested again.
  showLess() {
    // A page that is still loading would expand the list again when it
    // arrives, so collapsing waits until loading is done.
    if (this.isLoadingMore() || !this.canShowLess()) return;

    this.visibleCount.set(QUESTIONS_INITIAL_PAGE_SIZE);
    this.loadMoreError.set(false);
    this.announcement.set(`Showing the ${QUESTIONS_INITIAL_PAGE_SIZE} newest questions.`);

    // A reply form under a question that was just collapsed has nothing to
    // belong to any more.
    const replyingTo = this.replyingToId();

    if (
      replyingTo &&
      !this.isSavingReply() &&
      !this.visibleQuestions().some((question) => question.id === replyingTo)
    ) {
      this.closeReply();
    }

    // The "Show less" button disappears. Keep focus on the controls (or, if
    // there is nothing more to show, on the last question) so it is not lost.
    afterNextRender(
      () => {
        const root = this.host.nativeElement;

        (
          root.querySelector<HTMLElement>('.show-more') ??
          root.querySelector<HTMLElement>('.question-item:last-child')
        )?.focus();
      },
      { injector: this.injector },
    );
  }

  private announceMore(count: number) {
    this.announcement.set(`${count} more ${count === 1 ? 'question' : 'questions'} shown.`);
  }

  private clearForm() {
    this.questionModel.set({ question: '' });
    this.questionForm.question().reset();
    this.submitAttempted.set(false);
    this.submitError.set('');
  }

  // A different listing starts with a closed, empty form and no popups.
  private resetAskState() {
    this.clearForm();
    this.isFormOpen.set(false);
    this.isSubmitting.set(false);
    this.showLoginPrompt.set(false);
    this.showSuccess.set(false);

    // The same for a reply that was being written or saved.
    this.closeReply();
    this.isSavingReply.set(false);
    this.replyNotice.set(null);
  }

  private async resolveUser(isLoggedIn: boolean) {
    const request = ++this.userRequest;

    if (!isLoggedIn) {
      this.isFormOpen.set(false);
    }

    // The session is read even while the Auth signal still says "signed out"
    // (it is filled in a moment after the page loads), so a seller is
    // recognised from the start and never sees the button flash up.
    this.isUserResolved.set(false);

    try {
      const { data } = await this.auth.getSession();

      if (request !== this.userRequest) return;

      this.currentUserId.set(data.session?.user.id ?? null);
    } catch (error) {
      if (request !== this.userRequest) return;

      console.error('Could not look up the signed-in user:', error);
      this.currentUserId.set(null);
    }

    // The database still refuses a seller's own question, so a failed lookup
    // is safe: the seller would only see the form and get an error.
    this.isUserResolved.set(true);
  }

  private async loadFirstPage(listingId: string, isVisible: boolean) {
    const generation = ++this.generation;

    // Never show data of a previous listing.
    this.questions.set([]);
    // The questions are gone, so a reply form (or note) for one has no home.
    this.closeReply();
    this.replyNotice.set(null);
    this.visibleCount.set(QUESTIONS_INITIAL_PAGE_SIZE);
    this.total.set(0);
    this.nextOffset.set(0);
    this.loadError.set(false);
    this.loadMoreError.set(false);
    this.isLoadingMore.set(false);
    this.announcement.set('');

    if (!isVisible) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    const { data, error } = await this.questionsService.getQuestions(
      listingId,
      QUESTIONS_INITIAL_PAGE_SIZE,
      0,
    );

    if (generation !== this.generation) return;

    this.isLoading.set(false);

    if (error || !data) {
      console.error('Error loading questions:', error);
      this.loadError.set(true);
      return;
    }

    this.questions.set(data.questions);
    this.nextOffset.set(data.questions.length);
    this.total.set(data.total);
  }

  // Reloads the first page after a question was posted, without the loading
  // state, so the list does not flash. A failure leaves the old list.
  private async refresh() {
    const listingId = this.listingId();
    const generation = ++this.generation;

    this.isLoadingMore.set(false);
    this.loadMoreError.set(false);

    const { data, error } = await this.questionsService.getQuestions(
      listingId,
      QUESTIONS_INITIAL_PAGE_SIZE,
      0,
    );

    if (generation !== this.generation) return;

    if (error || !data) {
      console.error('Error refreshing questions:', error);
      return;
    }

    this.isLoading.set(false);
    this.loadError.set(false);
    this.questions.set(data.questions);
    this.visibleCount.set(QUESTIONS_INITIAL_PAGE_SIZE);
    this.nextOffset.set(data.questions.length);
    this.total.set(data.total);
  }

  // Move focus to the first newly loaded question, so keyboard and screen
  // reader users continue reading where the new content begins (and do not
  // lose focus if the "Show more" button disappears).
  private focusQuestion(id: string) {
    afterNextRender(
      () => {
        this.host.nativeElement.querySelector<HTMLElement>(`[data-question-id="${id}"]`)?.focus();
      },
      { injector: this.injector },
    );
  }
}
