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
} from '@angular/core';
import { ListingStatus } from '../../models/listing';
import {
  ListingQuestion,
  QUESTIONS_INITIAL_PAGE_SIZE,
  QUESTIONS_PAGE_SIZE,
} from '../../models/listing-question';
import { ListingQuestionsService } from '../../services/listing-questions';

// Dates read like "9 Nov 2026". Intl is used instead of Angular's DatePipe,
// which would add about 12 kB of date formatting code to the initial bundle.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Read-only public Q&A of a listing. Askers are always shown as
// "MEGURU member".
@Component({
  selector: 'app-listing-questions',
  templateUrl: './listing-questions.html',
  styleUrl: './listing-questions.css',
})
export class ListingQuestions {
  private questionsService = inject(ListingQuestionsService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  readonly listingId = input.required<string>();
  readonly status = input<ListingStatus>('published');

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

  // Incremented whenever the listing changes. A response that belongs to an
  // older generation is ignored, so stale data never reaches the screen.
  private generation = 0;

  constructor() {
    effect(() => {
      const listingId = this.listingId();
      const isVisible = this.isVisible();

      untracked(() => {
        void this.loadFirstPage(listingId, isVisible);
      });
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

  private async loadFirstPage(listingId: string, isVisible: boolean) {
    const generation = ++this.generation;

    // Never show data of a previous listing.
    this.questions.set([]);
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
