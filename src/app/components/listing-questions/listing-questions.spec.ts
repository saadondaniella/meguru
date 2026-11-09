import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ListingStatus } from '../../models/listing';
import { ListingQuestion } from '../../models/listing-question';
import { Auth } from '../../services/auth';
import { ListingQuestionsService } from '../../services/listing-questions';
import { ListingQuestions } from './listing-questions';

type Page = { data: { questions: ListingQuestion[]; total: number } | null; error: unknown };

const question = (n: number, overrides: Partial<ListingQuestion> = {}): ListingQuestion => ({
  id: `q${n}`,
  question: `Question ${n}`,
  created_at: new Date(Date.UTC(2026, 10, n, 10)).toISOString(),
  answer: null,
  answered_at: null,
  answer_updated_at: null,
  is_own: false,
  ...overrides,
});

const page = (questions: ListingQuestion[], total: number): Page => ({
  data: { questions, total },
  error: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));

  return { promise, resolve };
}

describe('ListingQuestions', () => {
  let fixture: ComponentFixture<ListingQuestions>;
  let el: HTMLElement;

  const service = { getQuestions: vi.fn(), askQuestion: vi.fn() };

  // The signed-in state. Visitors are signed out unless a test signs in.
  const isLoggedIn = signal(false);
  const auth = { isLoggedIn, getSession: vi.fn() };

  const signOut = () => {
    isLoggedIn.set(false);
    auth.getSession.mockResolvedValue({ data: { session: null } });
  };

  const signIn = (userId: string) => {
    isLoggedIn.set(true);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
  };

  // Lets the component's promise chains finish and renders the result.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const create = async (
    listingId = 'listing-1',
    status: ListingStatus = 'published',
    sellerId: string | null = 'seller-1',
  ) => {
    fixture = TestBed.createComponent(ListingQuestions);
    fixture.componentRef.setInput('listingId', listingId);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('sellerId', sellerId);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  };

  const items = () => Array.from(el.querySelectorAll<HTMLElement>('.question-item'));
  const showMoreButton = () => el.querySelector<HTMLButtonElement>('.show-more');

  beforeEach(() => {
    service.getQuestions.mockReset();
    service.askQuestion.mockReset();
    auth.getSession.mockReset();
    signOut();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      imports: [ListingQuestions],
      providers: [
        provideRouter([]),
        { provide: ListingQuestionsService, useValue: service },
        { provide: Auth, useValue: auth },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the three newest questions of the listing', async () => {
    service.getQuestions.mockResolvedValue(page([], 0));

    await create('listing-1');

    expect(service.getQuestions).toHaveBeenCalledTimes(1);
    expect(service.getQuestions).toHaveBeenCalledWith('listing-1', 3, 0);
  });

  it('shows each question with the author "MEGURU member" and its date', async () => {
    service.getQuestions.mockResolvedValue(page([question(3), question(2), question(1)], 3));

    await create();

    expect(items().length).toBe(3);
    expect(items()[0].textContent).toContain('Question 3');
    expect(items()[0].querySelector('.question-meta')?.textContent).toContain('MEGURU MEMBER');
    expect(items()[0].querySelector('time')?.textContent?.trim()).toBe('3 Nov 2026');
    expect(items()[0].querySelector('time')?.getAttribute('datetime')).toBe(question(3).created_at);
  });

  it('never shows an asker id', async () => {
    const withAskerId = { ...question(1), asker_id: 'secret-user-id' } as ListingQuestion;
    service.getQuestions.mockResolvedValue(page([withAskerId], 1));

    await create();

    expect(el.textContent).not.toContain('secret-user-id');
    expect(el.innerHTML).not.toContain('secret-user-id');
  });

  it('shows the seller answer beneath its question, and only when there is one', async () => {
    service.getQuestions.mockResolvedValue(
      page(
        [
          question(2, { answer: 'It fits true to size.', answered_at: '2026-11-04T10:00:00Z' }),
          question(1),
        ],
        2,
      ),
    );

    await create();

    const [answered, unanswered] = items();
    const answer = answered.querySelector('.question-answer');

    expect(answer?.textContent).toContain('ANSWER FROM THE SELLER');
    expect(answer?.textContent).toContain('It fits true to size.');
    expect(answer?.textContent).toContain('4 Nov 2026');
    expect(
      answered.querySelector('.question-text')!.compareDocumentPosition(answer!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(unanswered.querySelector('.question-answer')).toBeNull();
  });

  it('marks an answer as edited only when the seller changed it', async () => {
    service.getQuestions.mockResolvedValue(
      page(
        [
          question(2, {
            answer: 'Updated.',
            answered_at: '2026-11-04T10:00:00Z',
            answer_updated_at: '2026-11-05T10:00:00Z',
          }),
          question(1, { answer: 'Original.', answered_at: '2026-11-04T10:00:00Z' }),
        ],
        2,
      ),
    );

    await create();

    const [edited, original] = items();

    expect(edited.querySelector('.answer-edited')?.textContent).toContain('Edited');
    expect(original.querySelector('.answer-edited')).toBeNull();
  });

  it('shows no "Show more" button when everything is already shown', async () => {
    service.getQuestions.mockResolvedValue(page([question(2), question(1)], 2));

    await create();

    expect(showMoreButton()).toBeNull();
  });

  it('shows a "Show more" button when the listing has more questions than the first page', async () => {
    service.getQuestions.mockResolvedValue(page([question(9), question(8), question(7)], 9));

    await create();

    expect(showMoreButton()).not.toBeNull();
    expect(showMoreButton()!.textContent).toContain('SHOW MORE');
  });

  it('loads five more at a time, using the total to know when to stop', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
    await create();

    service.getQuestions.mockResolvedValueOnce(
      page([question(6), question(5), question(4), question(3), question(2)], 9),
    );
    showMoreButton()!.click();
    await settle();

    expect(service.getQuestions).toHaveBeenLastCalledWith('listing-1', 5, 3);
    expect(items().length).toBe(8);
    expect(items()[3].textContent).toContain('Question 6');
    // One question is left, so the button stays.
    expect(showMoreButton()).not.toBeNull();

    service.getQuestions.mockResolvedValueOnce(page([question(1)], 9));
    showMoreButton()!.click();
    await settle();

    expect(service.getQuestions).toHaveBeenLastCalledWith('listing-1', 5, 8);
    expect(items().length).toBe(9);
    expect(showMoreButton()).toBeNull();
  });

  it('moves focus to the first newly loaded question and announces it', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(5), question(4), question(3)], 5));
    await create();

    service.getQuestions.mockResolvedValueOnce(page([question(2), question(1)], 5));
    showMoreButton()!.click();
    await settle();

    expect(document.activeElement).toBe(el.querySelector('[data-question-id="q2"]'));
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain('2 more questions');
    // The button disappeared, but focus was not lost.
    expect(showMoreButton()).toBeNull();
  });

  it('ignores extra clicks while more questions are loading', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
    await create();

    const pending = deferred<Page>();
    service.getQuestions.mockReturnValueOnce(pending.promise);

    const button = showMoreButton()!;
    button.click();
    button.click();
    button.click();
    fixture.detectChanges();

    expect(service.getQuestions).toHaveBeenCalledTimes(2);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('LOADING');

    pending.resolve(page([question(6), question(5), question(4), question(3), question(2)], 9));
    await settle();

    expect(items().length).toBe(8);
  });

  it('does not show a question twice when new questions arrived between two requests', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(5), question(4), question(3)], 5));
    await create();

    // The second page starts with a question that is already on screen.
    service.getQuestions.mockResolvedValueOnce(page([question(3), question(2), question(1)], 6));
    showMoreButton()!.click();
    await settle();

    const ids = items().map((item) => item.getAttribute('data-question-id'));

    expect(ids).toEqual(['q5', 'q4', 'q3', 'q2', 'q1']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stops offering "Show more" if a page comes back empty', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
    await create();

    service.getQuestions.mockResolvedValueOnce(page([], 0));
    showMoreButton()!.click();
    await settle();

    expect(items().length).toBe(3);
    expect(showMoreButton()).toBeNull();
  });

  it('keeps the questions on screen and lets the visitor retry when "Show more" fails', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
    await create();

    service.getQuestions.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    showMoreButton()!.click();
    await settle();

    expect(items().length).toBe(3);
    expect(el.querySelector('.questions-error')?.getAttribute('role')).toBe('alert');
    expect(showMoreButton()).not.toBeNull();

    service.getQuestions.mockResolvedValueOnce(
      page([question(6), question(5), question(4), question(3), question(2)], 9),
    );
    showMoreButton()!.click();
    await settle();

    expect(items().length).toBe(8);
    expect(el.querySelector('.questions-error')).toBeNull();
  });

  it('shows a loading state while the first page is loading', async () => {
    const pending = deferred<Page>();
    service.getQuestions.mockReturnValue(pending.promise);

    await create();

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading questions');
    expect(items().length).toBe(0);

    pending.resolve(page([question(1)], 1));
    await settle();

    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(items().length).toBe(1);
  });

  it('shows an error with a retry button when the first page fails', async () => {
    service.getQuestions.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    await create();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load');

    service.getQuestions.mockResolvedValueOnce(page([question(1)], 1));
    el.querySelector<HTMLButtonElement>('.questions-message .questions-button')!.click();
    await settle();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(items().length).toBe(1);
  });

  it('shows an empty state when there are no questions', async () => {
    service.getQuestions.mockResolvedValue(page([], 0));

    await create();

    expect(el.textContent).toContain('No questions yet.');
    expect(items().length).toBe(0);
    expect(showMoreButton()).toBeNull();
  });

  it('tells visitors that a sold listing is closed for new questions', async () => {
    service.getQuestions.mockResolvedValue(page([question(1)], 1));

    await create('listing-1', 'sold');

    expect(el.querySelector('.questions-note')?.textContent).toContain('sold');
    expect(items().length).toBe(1);
  });

  it('shows nothing and requests nothing for a draft listing', async () => {
    await create('listing-1', 'draft');

    expect(service.getQuestions).not.toHaveBeenCalled();
    expect(el.querySelector('section')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('does not show questions of a previous listing when the listing changes', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(1)], 1));
    await create('listing-1');
    expect(items()[0].textContent).toContain('Question 1');

    service.getQuestions.mockResolvedValueOnce(page([question(2, { question: 'Other' })], 1));
    fixture.componentRef.setInput('listingId', 'listing-2');
    fixture.detectChanges();
    await settle();

    expect(service.getQuestions).toHaveBeenLastCalledWith('listing-2', 3, 0);
    expect(items().length).toBe(1);
    expect(items()[0].textContent).toContain('Other');
    expect(el.textContent).not.toContain('Question 1');
  });

  it('ignores a slow response that belongs to a previous listing', async () => {
    const slow = deferred<Page>();
    service.getQuestions.mockReturnValueOnce(slow.promise);
    await create('listing-1');

    service.getQuestions.mockResolvedValueOnce(page([question(2, { question: 'Fresh' })], 1));
    fixture.componentRef.setInput('listingId', 'listing-2');
    fixture.detectChanges();
    await settle();

    // The answer for listing 1 arrives late and must be dropped.
    slow.resolve(page([question(1, { question: 'Stale' })], 1));
    await settle();

    expect(items().length).toBe(1);
    expect(items()[0].textContent).toContain('Fresh');
    expect(el.textContent).not.toContain('Stale');
  });

  it('clears the old questions at once while the next listing is loading', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(1)], 1));
    await create('listing-1');

    const pending = deferred<Page>();
    service.getQuestions.mockReturnValueOnce(pending.promise);
    fixture.componentRef.setInput('listingId', 'listing-2');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(items().length).toBe(0);
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('ignores a "Show more" response for a listing the visitor already left', async () => {
    service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
    await create('listing-1');

    const slowMore = deferred<Page>();
    service.getQuestions.mockReturnValueOnce(slowMore.promise);
    showMoreButton()!.click();

    service.getQuestions.mockResolvedValueOnce(page([question(2, { question: 'Fresh' })], 1));
    fixture.componentRef.setInput('listingId', 'listing-2');
    fixture.detectChanges();
    await settle();

    slowMore.resolve(page([question(6, { question: 'Stale' })], 9));
    await settle();

    expect(items().length).toBe(1);
    expect(el.textContent).not.toContain('Stale');
  });

  it('formats dates as day, short month and year', async () => {
    service.getQuestions.mockResolvedValue(page([], 0));
    await create();

    const component = fixture.componentInstance;

    expect(component.formatDate('2026-09-09T12:00:00Z')).toBe('9 Sep 2026');
    expect(component.formatDate('2026-11-21T12:00:00Z')).toBe('21 Nov 2026');
  });

  it('shows no date text for an invalid date instead of failing', async () => {
    service.getQuestions.mockResolvedValue(page([], 0));
    await create();

    expect(fixture.componentInstance.formatDate('not a date')).toBe('');
  });

  describe('show less', () => {
    const showLessButton = () => el.querySelector<HTMLButtonElement>('.show-less');
    const ids = () => items().map((item) => item.getAttribute('data-question-id'));

    // A listing with 9 questions: the first page (3) and then 5 more are loaded.
    const expand = async () => {
      service.getQuestions.mockResolvedValueOnce(page([question(9), question(8), question(7)], 9));
      await create();

      service.getQuestions.mockResolvedValueOnce(
        page([question(6), question(5), question(4), question(3), question(2)], 9),
      );
      showMoreButton()!.click();
      await settle();
    };

    it('is not offered at first', async () => {
      service.getQuestions.mockResolvedValue(page([question(9), question(8), question(7)], 9));

      await create();

      expect(showLessButton()).toBeNull();
      expect(showMoreButton()).not.toBeNull();
    });

    it('is not offered, and neither is "Show more", for three questions or fewer', async () => {
      service.getQuestions.mockResolvedValue(page([question(3), question(2), question(1)], 3));

      await create();

      expect(items().length).toBe(3);
      expect(showLessButton()).toBeNull();
      expect(showMoreButton()).toBeNull();
      expect(el.querySelector('.questions-actions')).toBeNull();
    });

    it('is offered next to "Show more" once the list was expanded and more remain', async () => {
      await expand();

      expect(items().length).toBe(8);
      expect(showLessButton()).not.toBeNull();
      expect(showMoreButton()).not.toBeNull();
      expect(showLessButton()!.textContent).toContain('SHOW LESS');
      // Same MEGURU button as "Show more".
      expect(showLessButton()!.classList.contains('questions-button')).toBe(true);
      expect(showLessButton()!.getAttribute('type')).toBe('button');
    });

    it('is offered on its own once every question is loaded', async () => {
      await expand();

      service.getQuestions.mockResolvedValueOnce(page([question(1)], 9));
      showMoreButton()!.click();
      await settle();

      expect(items().length).toBe(9);
      expect(showMoreButton()).toBeNull();
      expect(showLessButton()).not.toBeNull();
    });

    it('is offered for a fourth question', async () => {
      service.getQuestions.mockResolvedValueOnce(page([question(4), question(3), question(2)], 4));
      await create();

      service.getQuestions.mockResolvedValueOnce(page([question(1)], 4));
      showMoreButton()!.click();
      await settle();

      expect(items().length).toBe(4);
      expect(showMoreButton()).toBeNull();
      expect(showLessButton()).not.toBeNull();
    });

    it('collapses the list to the first three questions, in the same order, without a request', async () => {
      await expand();
      expect(service.getQuestions).toHaveBeenCalledTimes(2);

      showLessButton()!.click();
      await settle();

      expect(ids()).toEqual(['q9', 'q8', 'q7']);
      expect(service.getQuestions).toHaveBeenCalledTimes(2);
      expect(showLessButton()).toBeNull();
    });

    it('keeps "Show more" available after collapsing', async () => {
      await expand();

      showLessButton()!.click();
      await settle();

      expect(showMoreButton()).not.toBeNull();
    });

    it('shows the next five again from the loaded questions without a request, then keeps loading', async () => {
      await expand();
      showLessButton()!.click();
      await settle();

      showMoreButton()!.click();
      await settle();

      expect(ids()).toEqual(['q9', 'q8', 'q7', 'q6', 'q5', 'q4', 'q3', 'q2']);
      expect(service.getQuestions).toHaveBeenCalledTimes(2);
      expect(showLessButton()).not.toBeNull();

      // Everything loaded is on screen again, so the next click fetches the rest.
      service.getQuestions.mockResolvedValueOnce(page([question(1)], 9));
      showMoreButton()!.click();
      await settle();

      expect(service.getQuestions).toHaveBeenCalledTimes(3);
      expect(service.getQuestions).toHaveBeenLastCalledWith('listing-1', 5, 8);
      expect(ids()).toEqual(['q9', 'q8', 'q7', 'q6', 'q5', 'q4', 'q3', 'q2', 'q1']);
    });

    it('reveals a partly hidden list five at a time', async () => {
      await expand();

      service.getQuestions.mockResolvedValueOnce(
        page([question(1), question(0), question(-1), question(-2), question(-3)], 13),
      );
      showMoreButton()!.click();
      await settle();
      expect(items().length).toBe(13);

      showLessButton()!.click();
      await settle();
      expect(items().length).toBe(3);

      showMoreButton()!.click();
      await settle();
      expect(items().length).toBe(8);

      showMoreButton()!.click();
      await settle();
      expect(items().length).toBe(13);
      expect(showMoreButton()).toBeNull();
      expect(showLessButton()).not.toBeNull();
    });

    it('keeps the seller answers when collapsing and expanding', async () => {
      service.getQuestions.mockResolvedValueOnce(
        page(
          [
            question(9, { answer: 'Answer to nine.', answered_at: '2026-11-10T10:00:00Z' }),
            question(8),
            question(7),
          ],
          9,
        ),
      );
      await create();

      service.getQuestions.mockResolvedValueOnce(
        page(
          [
            question(6, {
              answer: 'Answer to six.',
              answered_at: '2026-11-10T10:00:00Z',
              answer_updated_at: '2026-11-11T10:00:00Z',
            }),
            question(5),
            question(4),
            question(3),
            question(2),
          ],
          9,
        ),
      );
      showMoreButton()!.click();
      await settle();
      expect(el.textContent).toContain('Answer to six.');

      showLessButton()!.click();
      await settle();
      expect(el.textContent).toContain('Answer to nine.');
      expect(el.textContent).not.toContain('Answer to six.');

      showMoreButton()!.click();
      await settle();
      expect(el.textContent).toContain('Answer to nine.');
      expect(el.textContent).toContain('Answer to six.');
      expect(el.querySelectorAll('.answer-edited').length).toBe(1);
    });

    it('keeps focus on the controls and announces what is shown', async () => {
      await expand();

      showLessButton()!.click();
      await settle();

      expect(document.activeElement).toBe(showMoreButton());
      expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain(
        'Showing the 3 newest questions.',
      );
    });

    it('is ignored while more questions are still loading', async () => {
      await expand();

      const pending = deferred<Page>();
      service.getQuestions.mockReturnValueOnce(pending.promise);
      showMoreButton()!.click();
      fixture.detectChanges();

      expect(showLessButton()!.getAttribute('aria-disabled')).toBe('true');
      showLessButton()!.click();
      fixture.detectChanges();
      expect(items().length).toBe(8);

      pending.resolve(page([question(1)], 9));
      await settle();

      // The pending page was not lost and the list was not collapsed behind it.
      expect(items().length).toBe(9);
    });

    it('clears a "Show more" error', async () => {
      await expand();

      service.getQuestions.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
      showMoreButton()!.click();
      await settle();
      expect(el.querySelector('.questions-error')).not.toBeNull();

      showLessButton()!.click();
      await settle();

      expect(el.querySelector('.questions-error')).toBeNull();
      expect(items().length).toBe(3);
    });

    it('starts again from three questions when the listing changes', async () => {
      await expand();
      expect(items().length).toBe(8);

      service.getQuestions.mockResolvedValueOnce(
        page([question(30), question(29), question(28)], 9),
      );
      fixture.componentRef.setInput('listingId', 'listing-2');
      fixture.detectChanges();
      await settle();

      expect(ids()).toEqual(['q30', 'q29', 'q28']);
      expect(showLessButton()).toBeNull();
      expect(showMoreButton()).not.toBeNull();
    });
  });

  describe('asking a question', () => {
    const toggle = () => el.querySelector<HTMLButtonElement>('.ask-toggle');
    const form = () => el.querySelector<HTMLFormElement>('form.ask-form');
    const textarea = () => el.querySelector<HTMLTextAreaElement>('textarea.ask-input');
    const submitButton = () => el.querySelector<HTMLButtonElement>('.ask-submit');
    const loginPrompt = () => el.querySelector<HTMLElement>('.login-prompt');
    const successDialog = () => el.querySelector<HTMLElement>('.success-dialog');

    const posted = { id: 'new', question: 'x', created_at: '2026-11-10T10:00:00Z' };

    const openForm = async () => {
      toggle()!.click();
      await settle();
    };

    const type = async (text: string) => {
      const field = textarea()!;

      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    const submitForm = () => form()!.dispatchEvent(new Event('submit', { cancelable: true }));

    // A signed-in buyer who is not the seller, on a listing without questions.
    const createAsBuyer = async () => {
      signIn('buyer-1');
      await create('listing-1', 'published', 'seller-1');
    };

    beforeEach(() => {
      service.getQuestions.mockResolvedValue(page([], 0));
      service.askQuestion.mockResolvedValue({ data: posted, error: null });
    });

    describe('who sees the button', () => {
      it('shows "Ask a question", and no form, to a visitor who is not signed in', async () => {
        await create();

        expect(toggle()).not.toBeNull();
        expect(toggle()!.textContent).toContain('ASK A QUESTION');
        expect(toggle()!.classList.contains('questions-button')).toBe(true);
        expect(form()).toBeNull();
      });

      it('shows it to a signed-in buyer, with the form collapsed by default', async () => {
        await createAsBuyer();

        expect(toggle()).not.toBeNull();
        expect(form()).toBeNull();
        expect(textarea()).toBeNull();
        expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
      });

      it('shows neither the button nor the form to the owner of the listing', async () => {
        signIn('seller-1');

        await create('listing-1', 'published', 'seller-1');

        expect(toggle()).toBeNull();
        expect(form()).toBeNull();
        // The questions themselves stay visible.
        expect(el.querySelector('h2')?.textContent).toContain('ASK THE SELLER');
      });

      it('does not flash the button up before it is known who is signed in', async () => {
        const session = deferred<{ data: { session: { user: { id: string } } } }>();
        isLoggedIn.set(true);
        auth.getSession.mockReturnValue(session.promise);

        await create('listing-1', 'published', 'seller-1');
        expect(toggle()).toBeNull();

        // It turns out the signed-in user is a different person.
        session.resolve({ data: { session: { user: { id: 'buyer-1' } } } });
        await settle();

        expect(toggle()).not.toBeNull();
      });

      it('stays hidden from the owner even when the session is read before the sign-in state', async () => {
        // The Auth signal still says "signed out", but a session already exists.
        isLoggedIn.set(false);
        auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'seller-1' } } } });

        await create('listing-1', 'published', 'seller-1');

        expect(toggle()).toBeNull();
      });

      it('shows nothing to ask on a sold listing', async () => {
        signIn('buyer-1');

        await create('listing-1', 'sold', 'seller-1');

        expect(toggle()).toBeNull();
        expect(el.querySelector('.questions-note')?.textContent).toContain('sold');
      });

      it('shows nothing at all on a draft listing', async () => {
        signIn('buyer-1');

        await create('listing-1', 'draft', 'seller-1');

        expect(toggle()).toBeNull();
        expect(el.textContent?.trim()).toBe('');
      });
    });

    describe('visitors who are not signed in', () => {
      it('are asked to log in, instead of seeing a form', async () => {
        await create();

        toggle()!.click();
        await settle();

        expect(form()).toBeNull();
        expect(loginPrompt()).not.toBeNull();
        expect(loginPrompt()!.getAttribute('role')).toBe('dialog');
        expect(loginPrompt()!.getAttribute('aria-modal')).toBe('true');
        expect(loginPrompt()!.querySelector('a[href="/login"]')).not.toBeNull();
        expect(loginPrompt()!.querySelector('a[href="/register"]')).not.toBeNull();
        expect(service.askQuestion).not.toHaveBeenCalled();
      });

      it('move focus into the prompt', async () => {
        await create();

        toggle()!.click();
        await settle();

        expect(document.activeElement).toBe(loginPrompt()!.querySelector('a[href="/login"]'));
      });

      it('can close the prompt with Escape, and focus returns to the button', async () => {
        await create();
        toggle()!.click();
        await settle();

        loginPrompt()!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        await settle();

        expect(loginPrompt()).toBeNull();
        expect(document.activeElement).toBe(toggle());
      });

      it('can keep browsing, and focus returns to the button', async () => {
        await create();
        toggle()!.click();
        await settle();

        loginPrompt()!.querySelector<HTMLButtonElement>('.login-prompt-dismiss')!.click();
        await settle();

        expect(loginPrompt()).toBeNull();
        expect(document.activeElement).toBe(toggle());
      });

      it('keep Tab inside the prompt', async () => {
        await create();
        toggle()!.click();
        await settle();

        const last = loginPrompt()!.querySelector<HTMLElement>('.login-prompt-dismiss')!;
        last.focus();
        loginPrompt()!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
        );

        expect(document.activeElement).toBe(loginPrompt()!.querySelector('a[href="/login"]'));
      });
    });

    describe('the form', () => {
      it('opens and closes with the "Ask a question" button', async () => {
        await createAsBuyer();

        await openForm();

        expect(form()).not.toBeNull();
        expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
        expect(toggle()!.getAttribute('aria-controls')).toBe(form()!.id);

        await openForm();

        expect(form()).toBeNull();
        expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
      });

      it('moves focus to the question field when it opens', async () => {
        await createAsBuyer();

        await openForm();

        expect(document.activeElement).toBe(textarea());
      });

      it('has a labelled field, a counter, and SUBMIT QUESTION and CANCEL buttons', async () => {
        await createAsBuyer();

        await openForm();

        const label = form()!.querySelector<HTMLLabelElement>('label')!;

        expect(label.getAttribute('for')).toBe(textarea()!.id);
        expect(form()!.querySelector('.ask-counter')!.textContent).toContain('0 / 300');
        expect(submitButton()!.textContent).toContain('SUBMIT QUESTION');
        expect(submitButton()!.getAttribute('type')).toBe('submit');
        expect(form()!.querySelector('.ask-cancel')!.textContent).toContain('CANCEL');
        // Same MEGURU buttons as "Show more".
        expect(submitButton()!.classList.contains('questions-button')).toBe(true);
        expect(form()!.querySelector('.ask-cancel')!.classList.contains('questions-button')).toBe(
          true,
        );
        expect(textarea()!.getAttribute('aria-describedby')).toContain('ask-question-counter');
      });

      it('counts the characters as the buyer types', async () => {
        await createAsBuyer();
        await openForm();

        await type('Hello');

        expect(form()!.querySelector('.ask-counter')!.textContent).toContain('5 / 300');
      });

      it('keeps the draft when the form is collapsed and opened again', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it true to size?');

        await openForm();
        await openForm();

        expect(textarea()!.value).toBe('Is it true to size?');
      });

      it('CANCEL closes the form, throws the draft away, and returns focus to the button', async () => {
        await createAsBuyer();
        await openForm();
        await type('Never mind');

        form()!.querySelector<HTMLButtonElement>('.ask-cancel')!.click();
        await settle();

        expect(form()).toBeNull();
        expect(document.activeElement).toBe(toggle());

        await openForm();

        expect(textarea()!.value).toBe('');
        expect(form()!.querySelector('.ask-counter')!.textContent).toContain('0 / 300');
        expect(service.askQuestion).not.toHaveBeenCalled();
      });

      it('closes when the buyer signs out', async () => {
        await createAsBuyer();
        await openForm();
        expect(form()).not.toBeNull();

        signOut();
        await settle();

        expect(form()).toBeNull();
      });

      it('starts closed and empty again when the listing changes', async () => {
        await createAsBuyer();
        await openForm();
        await type('Draft for listing 1');

        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        expect(form()).toBeNull();

        await openForm();

        expect(textarea()!.value).toBe('');
      });
    });

    describe('validation', () => {
      it('does not send an empty question, and explains why', async () => {
        await createAsBuyer();
        await openForm();

        submitForm();
        await settle();

        expect(service.askQuestion).not.toHaveBeenCalled();
        expect(el.querySelector('#ask-question-error')?.textContent).toContain(
          'Write your question',
        );
        expect(el.querySelector('#ask-question-error')?.getAttribute('role')).toBe('alert');
        expect(textarea()!.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(textarea());
      });

      it('does not send a question made of spaces and line breaks', async () => {
        await createAsBuyer();
        await openForm();
        await type('   \n  ');

        submitForm();
        await settle();

        expect(service.askQuestion).not.toHaveBeenCalled();
        expect(el.querySelector('#ask-question-error')).not.toBeNull();
      });

      it('does not show an error on a fresh form', async () => {
        await createAsBuyer();

        await openForm();

        expect(el.querySelector('#ask-question-error')).toBeNull();
        expect(textarea()!.getAttribute('aria-invalid')).toBeNull();
      });

      it('does not send more than 300 characters, and says so', async () => {
        await createAsBuyer();
        await openForm();
        await type('x'.repeat(301));

        expect(form()!.querySelector('.ask-counter')!.classList.contains('is-over')).toBe(true);

        submitForm();
        await settle();

        expect(service.askQuestion).not.toHaveBeenCalled();
        expect(el.querySelector('#ask-question-error')?.textContent).toContain('at most 300');
      });

      it('accepts exactly 300 characters', async () => {
        await createAsBuyer();
        await openForm();
        await type('x'.repeat(300));

        submitForm();
        await settle();

        expect(service.askQuestion).toHaveBeenCalledWith('listing-1', 'x'.repeat(300));
      });
    });

    describe('posting', () => {
      it('sends the trimmed question for this listing through the service', async () => {
        await createAsBuyer();
        await openForm();
        await type('  Is it true to size?  ');

        submitForm();
        await settle();

        expect(service.askQuestion).toHaveBeenCalledTimes(1);
        expect(service.askQuestion).toHaveBeenCalledWith('listing-1', 'Is it true to size?');
      });

      it('disables submitting while the question is being posted', async () => {
        const pending = deferred<{ data: typeof posted; error: null }>();
        service.askQuestion.mockReturnValue(pending.promise);

        await createAsBuyer();
        await openForm();
        await type('Is it available?');

        submitForm();
        fixture.detectChanges();

        expect(submitButton()!.getAttribute('aria-disabled')).toBe('true');
        expect(submitButton()!.textContent).toContain('POSTING');

        pending.resolve({ data: posted, error: null });
        await settle();
      });

      it('prevents duplicate submissions', async () => {
        const pending = deferred<{ data: typeof posted; error: null }>();
        service.askQuestion.mockReturnValue(pending.promise);

        await createAsBuyer();
        await openForm();
        await type('Is it available?');

        submitForm();
        submitForm();
        submitButton()!.click();
        fixture.detectChanges();
        submitForm();

        expect(service.askQuestion).toHaveBeenCalledTimes(1);

        pending.resolve({ data: posted, error: null });
        await settle();

        expect(service.askQuestion).toHaveBeenCalledTimes(1);
      });

      it('closes the form, refreshes the list and shows the confirmation popup', async () => {
        service.getQuestions.mockResolvedValueOnce(page([question(1)], 1));
        await createAsBuyer();
        expect(items().length).toBe(1);

        await openForm();
        await type('Is it available?');

        // After posting, the list is reloaded and the new question comes first.
        service.getQuestions.mockResolvedValueOnce(
          page([question(2, { question: 'Is it available?' }), question(1)], 2),
        );
        submitForm();
        await settle();

        expect(form()).toBeNull();
        expect(service.getQuestions).toHaveBeenCalledTimes(2);
        expect(service.getQuestions).toHaveBeenLastCalledWith('listing-1', 3, 0);
        expect(items().length).toBe(2);
        expect(items()[0].textContent).toContain('Is it available?');

        expect(successDialog()).not.toBeNull();
        expect(successDialog()!.getAttribute('role')).toBe('dialog');
        expect(successDialog()!.getAttribute('aria-modal')).toBe('true');
        expect(successDialog()!.textContent).toContain('Your question has been posted.');
      });

      it('uses the same success popup as the rest of MEGURU and focuses its button', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it available?');

        submitForm();
        await settle();

        expect(successDialog()!.querySelector('.success-eyebrow')?.textContent).toContain(
          'MEGURU® / SUCCESS',
        );
        expect(successDialog()!.querySelector('.success-check')).not.toBeNull();
        expect(el.querySelector('.success-overlay')).not.toBeNull();
        expect(document.activeElement).toBe(successDialog()!.querySelector('.success-close-btn'));
        expect(document.activeElement?.textContent).toContain('GOT IT');
      });

      it('closes the popup with GOT IT and returns focus to the button', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();
        await settle();

        successDialog()!.querySelector<HTMLButtonElement>('.success-close-btn')!.click();
        await settle();

        expect(successDialog()).toBeNull();
        expect(document.activeElement).toBe(toggle());
      });

      it('closes the popup with Escape', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();
        await settle();

        successDialog()!
          .querySelector<HTMLButtonElement>('.success-close-btn')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle();

        expect(successDialog()).toBeNull();
      });

      it('keeps focus inside the popup when Tab is pressed', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();
        await settle();

        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        successDialog()!.querySelector('.success-close-btn')!.dispatchEvent(tab);

        expect(tab.defaultPrevented).toBe(true);
      });

      it('starts with an empty form the next time', async () => {
        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();
        await settle();
        successDialog()!.querySelector<HTMLButtonElement>('.success-close-btn')!.click();
        await settle();

        await openForm();

        expect(textarea()!.value).toBe('');
      });

      it('still confirms the post if refreshing the list fails', async () => {
        service.getQuestions.mockResolvedValueOnce(page([question(1)], 1));
        await createAsBuyer();
        await openForm();
        await type('Is it available?');

        service.getQuestions.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
        submitForm();
        await settle();

        expect(successDialog()).not.toBeNull();
        // The list that was already on screen stays.
        expect(items().length).toBe(1);
      });

      it('ignores a result that arrives after the visitor moved to another listing', async () => {
        const pending = deferred<{ data: typeof posted; error: null }>();
        service.askQuestion.mockReturnValue(pending.promise);

        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();

        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        pending.resolve({ data: posted, error: null });
        await settle();

        expect(successDialog()).toBeNull();
      });
    });

    describe('when the database refuses the question', () => {
      const refuse = async (error: { message: string; code?: string }) => {
        service.askQuestion.mockResolvedValue({ data: null, error });

        await createAsBuyer();
        await openForm();
        await type('Is it available?');
        submitForm();
        await settle();
      };

      it.each([
        ['too_many_unanswered', '3 unanswered questions'],
        ['rate_limited_hour', 'last hour'],
        ['rate_limited_day', 'daily question limit'],
        ['own_listing', 'your own listing'],
        ['listing_not_open', 'no longer accepting questions'],
        ['not_authenticated', 'log in'],
        ['invalid_length', 'between 1 and 300'],
        ['invalid_text', 'not allowed'],
      ])('explains %s in plain words', async (key, text) => {
        await refuse({ message: key });

        const alert = form()!.querySelector('.ask-form > .questions-error[role="alert"]');

        expect(alert?.textContent).toContain(text);
        // No raw error key is shown to the buyer.
        expect(el.textContent).not.toContain(key);
      });

      it('asks the buyer to log in when the request was not signed in', async () => {
        await refuse({
          message: 'permission denied for function ask_listing_question',
          code: '42501',
        });

        expect(form()!.textContent).toContain('log in');
      });

      it('shows a general message for anything unexpected', async () => {
        await refuse({ message: 'something odd happened' });

        expect(form()!.textContent).toContain('Could not post your question. Please try again.');
        expect(form()!.textContent).not.toContain('something odd happened');
      });

      it('keeps the form open with the question, and lets the buyer try again', async () => {
        await refuse({ message: 'rate_limited_hour' });

        expect(form()).not.toBeNull();
        expect(textarea()!.value).toBe('Is it available?');
        expect(submitButton()!.getAttribute('aria-disabled')).toBeNull();
        expect(submitButton()!.textContent).toContain('SUBMIT QUESTION');
        expect(successDialog()).toBeNull();
        // The list is not reloaded for a question that was not posted.
        expect(service.getQuestions).toHaveBeenCalledTimes(1);

        service.askQuestion.mockResolvedValue({ data: posted, error: null });
        submitForm();
        await settle();

        expect(service.askQuestion).toHaveBeenCalledTimes(2);
        expect(successDialog()).not.toBeNull();
      });

      it('clears the message when the form is closed and opened again', async () => {
        await refuse({ message: 'rate_limited_hour' });

        await openForm();
        await openForm();

        expect(form()!.textContent).not.toContain('last hour');
      });
    });

    it('never shows an asker id next to the new question', async () => {
      service.getQuestions.mockResolvedValue(
        page([{ ...question(1), asker_id: 'secret-user-id' } as ListingQuestion], 1),
      );

      await createAsBuyer();

      expect(el.innerHTML).not.toContain('secret-user-id');
      expect(items()[0].querySelector('.question-meta')?.textContent).toContain('MEGURU MEMBER');
    });
  });

  it('uses accessible, semantic markup', async () => {
    service.getQuestions.mockResolvedValue(page([question(9), question(8), question(7)], 9));

    await create();

    const section = el.querySelector('section')!;
    const heading = el.querySelector('h2')!;

    expect(heading.textContent).toContain('ASK THE SELLER');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(section.id).toBe('questions');
    expect(el.querySelector('ul.question-list')).not.toBeNull();
    expect(el.querySelectorAll('ul.question-list > li').length).toBe(3);
    expect(showMoreButton()!.tagName).toBe('BUTTON');
    expect(showMoreButton()!.getAttribute('type')).toBe('button');
  });
});
