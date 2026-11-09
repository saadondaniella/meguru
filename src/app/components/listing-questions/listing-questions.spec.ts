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

  const service = {
    getQuestions: vi.fn(),
    askQuestion: vi.fn(),
    answerQuestion: vi.fn(),
    reportContent: vi.fn(),
  };

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
    service.answerQuestion.mockReset();
    service.reportContent.mockReset();
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

  describe('replying to a question (the seller)', () => {
    const replyButton = (id: string) =>
      el.querySelector<HTMLButtonElement>(`[data-reply-button="${id}"]`);
    const replyButtons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.reply-button'));
    const replyForm = () => el.querySelector<HTMLFormElement>('form.reply-form');
    const replyForms = () => el.querySelectorAll('form.reply-form');
    const replyInput = () => el.querySelector<HTMLTextAreaElement>('textarea[data-reply-input]');
    const replySubmit = () => replyForm()!.querySelector<HTMLButtonElement>('.ask-submit');
    const replyCancel = () => replyForm()!.querySelector<HTMLButtonElement>('.reply-cancel');
    const notice = () => el.querySelector('.reply-notice');
    const liveMessage = () => el.querySelector('[aria-live="polite"]')?.textContent ?? '';
    const itemFor = (id: string) =>
      el.querySelector<HTMLElement>(`.question-item[data-question-id="${id}"]`)!;

    const answered = (n: number, answer = 'It fits well.') =>
      question(n, { answer, answered_at: '2026-11-04T10:00:00Z' });

    const saved = (id: string, answer: string, extra: Record<string, unknown> = {}) => ({
      data: {
        id,
        answer,
        answered_at: '2026-11-04T10:00:00Z',
        answer_updated_at: null,
        ...extra,
      },
      error: null,
    });

    // The seller of the listing, with q3 and q1 unanswered and q2 answered.
    const createAsSeller = async (
      questions: ListingQuestion[] = [question(3), answered(2), question(1)],
      total = questions.length,
    ) => {
      service.getQuestions.mockResolvedValue(page(questions, total));
      signIn('seller-1');
      await create('listing-1', 'published', 'seller-1');
    };

    const openReply = async (id: string) => {
      replyButton(id)!.click();
      await settle();
    };

    const typeReply = async (text: string) => {
      const field = replyInput()!;

      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    const submitReply = () => replyForm()!.dispatchEvent(new Event('submit', { cancelable: true }));

    beforeEach(() => {
      service.answerQuestion.mockImplementation((id: string, answer: string) =>
        Promise.resolve(saved(id, answer)),
      );
    });

    describe('who sees the reply buttons', () => {
      it('shows REPLY on unanswered questions and EDIT REPLY on answered ones', async () => {
        await createAsSeller();

        expect(replyButtons().length).toBe(3);
        expect(replyButton('q3')!.textContent).toContain('REPLY');
        expect(replyButton('q3')!.textContent).not.toContain('EDIT');
        expect(replyButton('q2')!.textContent).toContain('EDIT REPLY');
        expect(replyButton('q1')!.textContent).toContain('REPLY');
        expect(replyButton('q1')!.textContent).not.toContain('EDIT');
      });

      it('puts each button to the right of its question, in the same row', async () => {
        await createAsSeller();

        const row = itemFor('q3').querySelector('.question-row')!;
        const main = row.querySelector('.question-main')!;

        expect(main.textContent).toContain('Question 3');
        expect(row.contains(replyButton('q3'))).toBe(true);
        expect(
          main.compareDocumentPosition(replyButton('q3')!) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // The seller's answer is below the row, not inside it.
        expect(row.querySelector('.question-answer')).toBeNull();
      });

      it('gives REPLY and EDIT REPLY their own look', async () => {
        await createAsSeller();

        expect(replyButton('q3')!.classList.contains('reply-button')).toBe(true);
        expect(replyButton('q3')!.classList.contains('is-edit')).toBe(false);
        expect(replyButton('q2')!.classList.contains('is-edit')).toBe(true);
      });

      it('shows nothing to a visitor who is not signed in', async () => {
        service.getQuestions.mockResolvedValue(page([question(3), answered(2)], 2));

        await create('listing-1', 'published', 'seller-1');

        expect(replyButtons().length).toBe(0);
        expect(items().length).toBe(2);
      });

      it('shows nothing to a signed-in buyer', async () => {
        service.getQuestions.mockResolvedValue(page([question(3), answered(2)], 2));
        signIn('buyer-1');

        await create('listing-1', 'published', 'seller-1');

        expect(replyButtons().length).toBe(0);
      });

      it("shows nothing to a seller on someone else's listing", async () => {
        service.getQuestions.mockResolvedValue(page([question(3)], 1));
        signIn('another-seller');

        await create('listing-1', 'published', 'seller-1');

        expect(replyButtons().length).toBe(0);
      });

      it('shows nothing, even to the owner, once the listing is sold', async () => {
        service.getQuestions.mockResolvedValue(page([question(3), answered(2)], 2));
        signIn('seller-1');

        await create('listing-1', 'sold', 'seller-1');

        expect(items().length).toBe(2);
        expect(replyButtons().length).toBe(0);
      });

      it('does not show the buttons before it is known who is signed in', async () => {
        const session = deferred<{ data: { session: { user: { id: string } } } }>();
        service.getQuestions.mockResolvedValue(page([question(3)], 1));
        isLoggedIn.set(true);
        auth.getSession.mockReturnValue(session.promise);

        await create('listing-1', 'published', 'seller-1');
        expect(replyButtons().length).toBe(0);

        session.resolve({ data: { session: { user: { id: 'seller-1' } } } });
        await settle();

        expect(replyButtons().length).toBe(1);
      });

      it('does not give the seller the buyer question form', async () => {
        await createAsSeller();

        expect(el.querySelector('.ask-toggle')).toBeNull();
      });

      it('names the question in the accessible label, after the visible words', async () => {
        await createAsSeller([
          question(3, { question: 'Is it true to size?' }),
          answered(2),
          question(1, { question: 'x'.repeat(80) }),
        ]);

        expect(replyButton('q3')!.getAttribute('aria-label')).toBe(
          'Reply to the question: Is it true to size?',
        );
        expect(replyButton('q2')!.getAttribute('aria-label')).toBe(
          'Edit reply to the question: Question 2',
        );
        expect(replyButton('q1')!.getAttribute('aria-label')).toBe(
          `Reply to the question: ${'x'.repeat(60)}…`,
        );
        // The visible text is part of the accessible name.
        expect(replyButton('q3')!.getAttribute('aria-label')!.toLowerCase()).toContain('reply');
        expect(replyButton('q2')!.getAttribute('aria-label')!.toLowerCase()).toContain(
          'edit reply',
        );
      });

      it('uses real buttons that do not submit anything', async () => {
        await createAsSeller();

        for (const button of replyButtons()) {
          expect(button.tagName).toBe('BUTTON');
          expect(button.getAttribute('type')).toBe('button');
        }
      });
    });

    describe('the reply form', () => {
      it('opens directly below the question it belongs to', async () => {
        await createAsSeller();

        await openReply('q3');

        const form = replyForm()!;

        expect(replyForms().length).toBe(1);
        expect(itemFor('q3').contains(form)).toBe(true);
        expect(
          itemFor('q3').querySelector('.question-row')!.compareDocumentPosition(form) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(itemFor('q1').querySelector('form')).toBeNull();
      });

      it('is empty for a new reply, with SUBMIT REPLY and CANCEL', async () => {
        await createAsSeller();

        await openReply('q3');

        expect(replyInput()!.value).toBe('');
        expect(replySubmit()!.textContent).toContain('SUBMIT REPLY');
        expect(replySubmit()!.getAttribute('type')).toBe('submit');
        expect(replyCancel()!.textContent).toContain('CANCEL');
        expect(replyCancel()!.getAttribute('type')).toBe('button');
        expect(replyForm()!.querySelector('.ask-counter')!.textContent).toContain('0 / 500');
      });

      it('moves focus to the reply field', async () => {
        await createAsSeller();

        await openReply('q3');

        expect(document.activeElement).toBe(replyInput());
      });

      it('is filled with the current reply when editing, with SAVE CHANGES', async () => {
        await createAsSeller();

        await openReply('q2');

        expect(replyInput()!.value).toBe('It fits well.');
        expect(replySubmit()!.textContent).toContain('SAVE CHANGES');
        expect(replyForm()!.querySelector('.ask-counter')!.textContent).toContain('13 / 500');
        expect(document.activeElement).toBe(replyInput());
      });

      it('replaces the shown reply while it is being edited', async () => {
        await createAsSeller();
        expect(itemFor('q2').querySelector('.question-answer')).not.toBeNull();

        await openReply('q2');

        expect(itemFor('q2').querySelector('.question-answer')).toBeNull();
        expect(itemFor('q2').querySelector('.question-text')!.textContent).toContain('Question 2');
      });

      it('counts the characters as the seller types', async () => {
        await createAsSeller();
        await openReply('q3');

        await typeReply('Yes, it is.');

        expect(replyForm()!.querySelector('.ask-counter')!.textContent).toContain('11 / 500');
      });

      it('has a label, a hint and a counter tied to the field', async () => {
        await createAsSeller();
        await openReply('q3');

        const label = replyForm()!.querySelector('label')!;

        expect(label.getAttribute('for')).toBe(replyInput()!.id);
        expect(label.textContent).toContain('YOUR REPLY');

        const described = replyInput()!.getAttribute('aria-describedby')!.split(' ');

        expect(described.length).toBe(2);

        for (const id of described) {
          expect(replyForm()!.querySelector(`#${id}`)).not.toBeNull();
        }

        expect(replyForm()!.textContent).toContain('Your reply is public.');
      });

      it('tells screen readers which button opened it', async () => {
        await createAsSeller();

        await openReply('q3');

        expect(replyButton('q3')!.getAttribute('aria-expanded')).toBe('true');
        expect(replyButton('q3')!.getAttribute('aria-controls')).toBe(replyForm()!.id);
        expect(replyButton('q1')!.getAttribute('aria-expanded')).toBe('false');
      });

      it('allows only one reply form at a time', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('A half written reply');

        await openReply('q1');

        expect(replyForms().length).toBe(1);
        expect(itemFor('q3').querySelector('form')).toBeNull();
        expect(itemFor('q1').querySelector('form')).not.toBeNull();
        // The other draft is not carried over.
        expect(replyInput()!.value).toBe('');
        expect(replyButton('q3')!.getAttribute('aria-expanded')).toBe('false');
      });

      it('can open an edit form after a reply form, with the right text', async () => {
        await createAsSeller();
        await openReply('q3');

        await openReply('q2');

        expect(replyForms().length).toBe(1);
        expect(replyInput()!.value).toBe('It fits well.');
      });

      it('closes when the same button is pressed again', async () => {
        await createAsSeller();
        await openReply('q3');

        await openReply('q3');

        expect(replyForm()).toBeNull();
        expect(document.activeElement).toBe(replyButton('q3'));
      });
    });

    describe('cancelling', () => {
      it('closes the form, throws the text away and returns focus to the button', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Never mind');

        replyCancel()!.click();
        await settle();

        expect(replyForm()).toBeNull();
        expect(document.activeElement).toBe(replyButton('q3'));
        expect(service.answerQuestion).not.toHaveBeenCalled();

        await openReply('q3');

        expect(replyInput()!.value).toBe('');
      });

      it('leaves the saved reply untouched when an edit is cancelled', async () => {
        await createAsSeller();
        await openReply('q2');
        await typeReply('Something else entirely');

        replyCancel()!.click();
        await settle();

        expect(itemFor('q2').querySelector('.answer-text')!.textContent).toBe('It fits well.');
        expect(document.activeElement).toBe(replyButton('q2'));

        await openReply('q2');

        expect(replyInput()!.value).toBe('It fits well.');
      });

      it('clears an error message', async () => {
        service.answerQuestion.mockResolvedValue({ data: null, error: { message: 'boom' } });
        await createAsSeller();
        await openReply('q3');
        await typeReply('A reply');
        submitReply();
        await settle();
        expect(replyForm()!.querySelector('[role="alert"]')).not.toBeNull();

        replyCancel()!.click();
        await settle();
        await openReply('q3');

        expect(replyForm()!.querySelector('[role="alert"]')).toBeNull();
      });
    });

    describe('validation', () => {
      it('does not save an empty reply, and explains why', async () => {
        await createAsSeller();
        await openReply('q3');

        submitReply();
        await settle();

        expect(service.answerQuestion).not.toHaveBeenCalled();
        expect(replyForm()!.querySelector('[role="alert"]')!.textContent).toContain(
          'Write your reply',
        );
        expect(replyInput()!.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(replyInput());
        expect(replyInput()!.getAttribute('aria-describedby')).toContain('reply-error-');
      });

      it('does not save a reply made of spaces and line breaks', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('   \n  ');

        submitReply();
        await settle();

        expect(service.answerQuestion).not.toHaveBeenCalled();
        expect(replyForm()!.querySelector('[role="alert"]')).not.toBeNull();
      });

      it('does not save a reply that has been emptied while editing', async () => {
        await createAsSeller();
        await openReply('q2');
        await typeReply('');

        submitReply();
        await settle();

        expect(service.answerQuestion).not.toHaveBeenCalled();
        expect(itemFor('q2').querySelector('form')).not.toBeNull();
      });

      it('shows no error on a fresh form', async () => {
        await createAsSeller();

        await openReply('q3');

        expect(replyForm()!.querySelector('[role="alert"]')).toBeNull();
        expect(replyInput()!.getAttribute('aria-invalid')).toBeNull();
      });

      it('does not save more than 500 characters, and says so', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('x'.repeat(501));

        expect(replyForm()!.querySelector('.ask-counter')!.classList.contains('is-over')).toBe(
          true,
        );

        submitReply();
        await settle();

        expect(service.answerQuestion).not.toHaveBeenCalled();
        expect(replyForm()!.querySelector('[role="alert"]')!.textContent).toContain('at most 500');
      });

      it('accepts exactly 500 characters', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('x'.repeat(500));

        submitReply();
        await settle();

        expect(service.answerQuestion).toHaveBeenCalledWith('q3', 'x'.repeat(500));
      });
    });

    describe('saving a reply', () => {
      it('sends the trimmed reply for that question through the service', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('  Yes, it fits.  ');

        submitReply();
        await settle();

        expect(service.answerQuestion).toHaveBeenCalledTimes(1);
        expect(service.answerQuestion).toHaveBeenCalledWith('q3', 'Yes, it fits.');
      });

      it('disables saving while the reply is being saved', async () => {
        const pending = deferred<ReturnType<typeof saved>>();
        service.answerQuestion.mockReturnValue(pending.promise);

        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        fixture.detectChanges();

        expect(replySubmit()!.getAttribute('aria-disabled')).toBe('true');
        expect(replySubmit()!.getAttribute('aria-busy')).toBe('true');
        expect(replySubmit()!.textContent).toContain('SAVING');
        expect(replyCancel()!.getAttribute('aria-disabled')).toBe('true');

        pending.resolve(saved('q3', 'Yes, it fits.'));
        await settle();
      });

      it('prevents duplicate requests', async () => {
        const pending = deferred<ReturnType<typeof saved>>();
        service.answerQuestion.mockReturnValue(pending.promise);

        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        submitReply();
        replySubmit()!.click();
        fixture.detectChanges();
        submitReply();

        expect(service.answerQuestion).toHaveBeenCalledTimes(1);

        // The same through the component itself, whatever the browser does with events.
        void fixture.componentInstance.submitReply(new Event('submit'));
        void fixture.componentInstance.submitReply(new Event('submit'));

        expect(service.answerQuestion).toHaveBeenCalledTimes(1);

        pending.resolve(saved('q3', 'Yes, it fits.'));
        await settle();

        expect(service.answerQuestion).toHaveBeenCalledTimes(1);
      });

      it('keeps the form open while saving, even if CANCEL or another REPLY is pressed', async () => {
        const pending = deferred<ReturnType<typeof saved>>();
        service.answerQuestion.mockReturnValue(pending.promise);

        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');
        submitReply();
        fixture.detectChanges();

        replyCancel()!.click();
        replyButton('q1')!.click();
        fixture.detectChanges();

        expect(replyForms().length).toBe(1);
        expect(itemFor('q3').querySelector('form')).not.toBeNull();

        pending.resolve(saved('q3', 'Yes, it fits.'));
        await settle();

        expect(replyForm()).toBeNull();
      });

      it('shows a new reply at once, without reloading the list or opening a popup', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        await settle();

        expect(replyForm()).toBeNull();
        expect(itemFor('q3').querySelector('.answer-text')!.textContent).toBe('Yes, it fits.');
        expect(itemFor('q3').querySelector('.answer-meta')!.textContent).toContain(
          'ANSWER FROM THE SELLER',
        );
        expect(itemFor('q3').querySelector('.answer-meta')!.textContent).toContain('4 Nov 2026');
        // A first reply is not "edited".
        expect(itemFor('q3').querySelector('.answer-edited')).toBeNull();
        // No page refresh and no popup.
        expect(service.getQuestions).toHaveBeenCalledTimes(1);
        expect(el.querySelector('.success-dialog')).toBeNull();
        expect(el.querySelector('.success-overlay')).toBeNull();
      });

      it('turns REPLY into EDIT REPLY once the reply is saved', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        await settle();

        expect(replyButton('q3')!.textContent).toContain('EDIT REPLY');
        expect(replyButton('q3')!.classList.contains('is-edit')).toBe(true);
      });

      it('confirms a new reply inline with "Reply posted"', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        await settle();

        expect(itemFor('q3').querySelector('.reply-notice')!.textContent).toContain('Reply posted');
        // Only under the question that was answered.
        expect(itemFor('q1').querySelector('.reply-notice')).toBeNull();
        expect(liveMessage()).toContain('Reply posted.');
      });

      it('keeps keyboard focus on the question after saving', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        await settle();

        expect(document.activeElement).toBe(itemFor('q3'));
      });

      it('updates an edited reply, keeping the original date and showing "Edited"', async () => {
        service.answerQuestion.mockResolvedValue(
          saved('q2', 'It runs a little small.', {
            answer_updated_at: '2026-11-09T10:00:00Z',
          }),
        );
        await createAsSeller();
        expect(itemFor('q2').querySelector('.answer-edited')).toBeNull();

        await openReply('q2');
        await typeReply('It runs a little small.');
        submitReply();
        await settle();

        expect(service.answerQuestion).toHaveBeenCalledWith('q2', 'It runs a little small.');
        expect(itemFor('q2').querySelector('.answer-text')!.textContent).toBe(
          'It runs a little small.',
        );
        // The date of the first reply, as returned by the database.
        expect(itemFor('q2').querySelector('.answer-meta')!.textContent).toContain('4 Nov 2026');
        expect(itemFor('q2').querySelector('.answer-edited')!.textContent).toContain('Edited');
      });

      it('confirms an edit inline with "Reply updated"', async () => {
        service.answerQuestion.mockResolvedValue(
          saved('q2', 'Changed.', { answer_updated_at: '2026-11-09T10:00:00Z' }),
        );
        await createAsSeller();
        await openReply('q2');
        await typeReply('Changed.');

        submitReply();
        await settle();

        expect(itemFor('q2').querySelector('.reply-notice')!.textContent).toContain(
          'Reply updated',
        );
        expect(liveMessage()).toContain('Reply updated.');
        expect(el.querySelector('.success-dialog')).toBeNull();
      });

      it('shows "Edited" only when the database reports a change', async () => {
        // Saving the same text again: the database keeps answer_updated_at empty.
        service.answerQuestion.mockResolvedValue(saved('q2', 'It fits well.'));
        await createAsSeller();
        await openReply('q2');

        submitReply();
        await settle();

        expect(itemFor('q2').querySelector('.answer-edited')).toBeNull();
      });

      it('keeps "Edited" on a reply that was changed earlier and is saved again', async () => {
        const edited = question(2, {
          answer: 'Earlier edit.',
          answered_at: '2026-11-04T10:00:00Z',
          answer_updated_at: '2026-11-05T10:00:00Z',
        });
        service.answerQuestion.mockResolvedValue(
          saved('q2', 'Earlier edit.', { answer_updated_at: '2026-11-05T10:00:00Z' }),
        );
        await createAsSeller([question(3), edited]);
        expect(itemFor('q2').querySelector('.answer-edited')).not.toBeNull();

        await openReply('q2');
        submitReply();
        await settle();

        expect(itemFor('q2').querySelector('.answer-edited')).not.toBeNull();
      });

      it('leaves every other question as it was', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');

        submitReply();
        await settle();

        expect(items().map((item) => item.getAttribute('data-question-id'))).toEqual([
          'q3',
          'q2',
          'q1',
        ]);
        expect(itemFor('q2').querySelector('.answer-text')!.textContent).toBe('It fits well.');
        expect(itemFor('q1').querySelector('.question-answer')).toBeNull();
      });

      it('replaces the confirmation when another reply is opened', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');
        submitReply();
        await settle();
        expect(notice()).not.toBeNull();

        await openReply('q1');

        expect(notice()).toBeNull();
      });

      it('lets the seller edit a reply they just posted', async () => {
        await createAsSeller();
        await openReply('q3');
        await typeReply('First version.');
        submitReply();
        await settle();

        await openReply('q3');

        expect(replyInput()!.value).toBe('First version.');
        expect(replySubmit()!.textContent).toContain('SAVE CHANGES');
      });
    });

    describe('when saving fails', () => {
      const failWith = async (error: { message: string; code?: string }) => {
        service.answerQuestion.mockResolvedValue({ data: null, error });

        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');
        submitReply();
        await settle();
      };

      const alertText = () =>
        Array.from(replyForm()!.querySelectorAll('[role="alert"]'))
          .map((node) => node.textContent)
          .join(' ');

      it.each([
        ['not_answerable', 'cannot reply to this question'],
        ['listing_not_open', 'not open for replies'],
        ['not_authenticated', 'log in'],
        ['invalid_length', 'between 1 and 500'],
        ['invalid_text', 'not allowed'],
      ])('explains %s in plain words', async (key, text) => {
        await failWith({ message: key });

        expect(alertText()).toContain(text);
        // No raw error key is shown to the seller.
        expect(el.textContent).not.toContain(key);
      });

      it('asks the seller to log in when the request was not signed in', async () => {
        await failWith({
          message: 'permission denied for function answer_listing_question',
          code: '42501',
        });

        expect(alertText()).toContain('log in');
      });

      it('shows a general message for anything unexpected', async () => {
        await failWith({ message: 'something odd happened' });

        expect(alertText()).toContain('Could not save your reply. Please try again.');
        expect(alertText()).not.toContain('something odd happened');
      });

      it('announces the error to screen readers', async () => {
        await failWith({ message: 'listing_not_open' });

        expect(replyForm()!.querySelector('[role="alert"]')).not.toBeNull();
      });

      it('keeps the form open with everything the seller wrote', async () => {
        await failWith({ message: 'listing_not_open' });

        expect(replyForm()).not.toBeNull();
        expect(replyInput()!.value).toBe('Yes, it fits.');
        expect(replySubmit()!.getAttribute('aria-disabled')).toBeNull();
        expect(replySubmit()!.textContent).toContain('SUBMIT REPLY');
      });

      it('keeps what the seller wrote when editing, and the old reply stays saved', async () => {
        service.answerQuestion.mockResolvedValue({
          data: null,
          error: { message: 'not_answerable' },
        });
        await createAsSeller();
        await openReply('q2');
        await typeReply('A better reply');

        submitReply();
        await settle();

        expect(replyInput()!.value).toBe('A better reply');

        replyCancel()!.click();
        await settle();

        // Nothing was saved, so the old reply is still what visitors see.
        expect(itemFor('q2').querySelector('.answer-text')!.textContent).toBe('It fits well.');
      });

      it('shows no confirmation, and changes nothing on screen', async () => {
        await failWith({ message: 'listing_not_open' });

        expect(notice()).toBeNull();
        expect(itemFor('q3').querySelector('.question-answer')).toBeNull();
        expect(replyButton('q3')!.textContent).not.toContain('EDIT');
      });

      it('lets the seller try again', async () => {
        await failWith({ message: 'listing_not_open' });

        service.answerQuestion.mockResolvedValue(saved('q3', 'Yes, it fits.'));
        submitReply();
        await settle();

        expect(service.answerQuestion).toHaveBeenCalledTimes(2);
        expect(replyForm()).toBeNull();
        expect(itemFor('q3').querySelector('.answer-text')!.textContent).toBe('Yes, it fits.');
      });
    });

    describe('when things change around an open form', () => {
      it('closes the form when the question is collapsed by SHOW LESS', async () => {
        const first = [question(9), question(8), question(7)];
        const second = [question(6), question(5), question(4), question(3), question(2)];

        service.getQuestions.mockResolvedValueOnce(page(first, 9));
        signIn('seller-1');
        await create('listing-1', 'published', 'seller-1');

        service.getQuestions.mockResolvedValueOnce(page(second, 9));
        showMoreButton()!.click();
        await settle();

        await openReply('q4');
        expect(replyForm()).not.toBeNull();

        el.querySelector<HTMLButtonElement>('.show-less')!.click();
        await settle();

        expect(replyForm()).toBeNull();
        expect(items().length).toBe(3);
      });

      it('keeps the form open when SHOW LESS does not hide its question', async () => {
        const first = [question(9), question(8), question(7)];
        const second = [question(6), question(5), question(4), question(3), question(2)];

        service.getQuestions.mockResolvedValueOnce(page(first, 9));
        signIn('seller-1');
        await create('listing-1', 'published', 'seller-1');

        service.getQuestions.mockResolvedValueOnce(page(second, 9));
        showMoreButton()!.click();
        await settle();

        await openReply('q9');
        el.querySelector<HTMLButtonElement>('.show-less')!.click();
        await settle();

        expect(replyForm()).not.toBeNull();
      });

      it('closes the form when the seller signs out', async () => {
        await createAsSeller();
        await openReply('q3');
        expect(replyForm()).not.toBeNull();

        signOut();
        await settle();

        expect(replyForm()).toBeNull();
        expect(replyButtons().length).toBe(0);
      });

      it('starts again when the listing changes, and ignores a late result', async () => {
        const pending = deferred<ReturnType<typeof saved>>();
        service.answerQuestion.mockReturnValue(pending.promise);
        await createAsSeller();
        await openReply('q3');
        await typeReply('Yes, it fits.');
        submitReply();

        service.getQuestions.mockResolvedValue(page([question(30, { question: 'Other' })], 1));
        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        expect(replyForm()).toBeNull();
        expect(notice()).toBeNull();

        pending.resolve(saved('q3', 'Yes, it fits.'));
        await settle();

        expect(notice()).toBeNull();
        expect(items().length).toBe(1);
        expect(items()[0].textContent).toContain('Other');
        expect(el.textContent).not.toContain('Yes, it fits.');
      });
    });

    describe('what stays the same', () => {
      it('still shows the questions, answers and pagination to the seller', async () => {
        await createAsSeller([question(9), answered(8, 'An answer.'), question(7)], 9);

        expect(items().length).toBe(3);
        expect(itemFor('q8').querySelector('.answer-text')!.textContent).toBe('An answer.');
        expect(showMoreButton()).not.toBeNull();
        expect(itemFor('q9').querySelector('.question-meta')!.textContent).toContain(
          'MEGURU MEMBER',
        );
      });

      it('still shows no reply buttons, only the read-only list, to a buyer', async () => {
        service.getQuestions.mockResolvedValue(page([question(3), answered(2)], 2));
        signIn('buyer-1');

        await create('listing-1', 'published', 'seller-1');

        expect(items().length).toBe(2);
        expect(replyButtons().length).toBe(0);
        expect(el.querySelector('.ask-toggle')).not.toBeNull();
      });
    });
  });

  describe('reporting a question or an answer', () => {
    const itemFor = (id: string) =>
      el.querySelector<HTMLElement>(`.question-item[data-question-id="${id}"]`)!;
    const questionReport = (id: string) =>
      itemFor(id).querySelector<HTMLButtonElement>('.question-meta .report-link');
    const answerReport = (id: string) =>
      itemFor(id).querySelector<HTMLButtonElement>('.answer-meta .report-link');
    const allReportLinks = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.report-link'));
    const loginPrompt = () => el.querySelector<HTMLElement>('.login-prompt');
    const modal = () => el.querySelector<HTMLElement>('.report-dialog');
    const reasonSelect = () => el.querySelector<HTMLSelectElement>('#report-reason');
    const detailsInput = () => el.querySelector<HTMLTextAreaElement>('#report-details');
    const submitButton = () => el.querySelector<HTMLButtonElement>('.report-submit');
    const cancelButton = () => el.querySelector<HTMLButtonElement>('.report-cancel');
    const closeButton = () => el.querySelector<HTMLButtonElement>('.report-close');
    const modalAlerts = () =>
      Array.from(modal()?.querySelectorAll('[role="alert"]') ?? [])
        .map((node) => node.textContent?.trim())
        .join(' | ');
    const liveMessage = () => el.querySelector('[aria-live="polite"]')?.textContent ?? '';

    const answered = (n: number, answer = 'It fits well.') =>
      question(n, { answer, answered_at: '2026-11-04T10:00:00Z' });

    // q3 is unanswered, q2 is answered, q1 is the viewer's own question.
    const threeQuestions = () => [question(3), answered(2), question(1, { is_own: true })];

    const createWith = async (
      signedInAs: string | null,
      questions: ListingQuestion[] = threeQuestions(),
      status: ListingStatus = 'published',
    ) => {
      service.getQuestions.mockResolvedValue(page(questions, questions.length));

      if (signedInAs) signIn(signedInAs);

      await create('listing-1', status, 'seller-1');
    };

    const open = async (button: HTMLButtonElement | null) => {
      button!.click();
      await settle();
    };

    const chooseReason = async (value: string) => {
      const select = reasonSelect()!;

      select.value = value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    const typeDetails = async (text: string) => {
      const field = detailsInput()!;

      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    };

    const submitForm = () =>
      el
        .querySelector('form.report-form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));

    const keydown = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });

      modal()!.dispatchEvent(event);

      return event;
    };

    beforeEach(() => {
      service.reportContent.mockResolvedValue({ error: null });
    });

    describe('the REPORT controls', () => {
      it("puts REPORT directly after the date in each question's metadata row", async () => {
        await createWith('buyer-1');

        const meta = itemFor('q3').querySelector('.question-meta')!;
        const button = questionReport('q3')!;

        expect(button.textContent).toContain('REPORT');
        expect(button.textContent).not.toContain('REPORTED');
        // Directly after the date: only a hidden separator dot comes in between.
        const date = meta.querySelector('time')!;
        const separator = date.nextElementSibling!;

        expect(separator.getAttribute('aria-hidden')).toBe('true');
        expect(separator.nextElementSibling).toBe(button);
        expect(meta.firstElementChild!.textContent).toContain('MEGURU MEMBER');
      });

      it("has a separate REPORT after the date in each seller answer's metadata row", async () => {
        await createWith('buyer-1');

        const meta = itemFor('q2').querySelector('.answer-meta')!;
        const button = answerReport('q2')!;

        expect(button.textContent).toContain('REPORT');
        expect(
          meta.querySelector('time')!.compareDocumentPosition(button) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // A different control from the one on the question above it.
        expect(button).not.toBe(questionReport('q2'));
        expect(itemFor('q2').querySelectorAll('.report-link').length).toBe(2);
      });

      it('puts REPORT after "Edited" in the answer row, when the answer was edited', async () => {
        await createWith('buyer-1', [
          question(2, {
            answer: 'Edited.',
            answered_at: '2026-11-04T10:00:00Z',
            answer_updated_at: '2026-11-05T10:00:00Z',
          }),
        ]);

        const meta = itemFor('q2').querySelector('.answer-meta')!;

        expect(
          meta.querySelector('.answer-edited')!.compareDocumentPosition(answerReport('q2')!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });

      it('is only a small text control: a real button without icons or images', async () => {
        await createWith('buyer-1');

        for (const link of allReportLinks()) {
          expect(link.tagName).toBe('BUTTON');
          expect(link.getAttribute('type')).toBe('button');
          expect(link.classList.contains('report-link')).toBe(true);
          expect(link.querySelector('svg, img')).toBeNull();
        }
      });

      it("has no REPORT on the viewer's own question", async () => {
        await createWith('buyer-1');

        expect(questionReport('q1')).toBeNull();
        expect(questionReport('q3')).not.toBeNull();
        expect(questionReport('q2')).not.toBeNull();
      });

      it('has no answer REPORT for the seller, but they can report questions', async () => {
        await createWith('seller-1', [question(3), answered(2)]);

        expect(answerReport('q2')).toBeNull();
        expect(questionReport('q3')).not.toBeNull();
        expect(questionReport('q2')).not.toBeNull();
      });

      it("lets the asker report the seller's answer to their own question", async () => {
        await createWith(
          'buyer-1',
          [answered(2)].map((q) => ({ ...q, is_own: true })),
        );

        expect(questionReport('q2')).toBeNull();
        expect(answerReport('q2')).not.toBeNull();
      });

      it('shows REPORT to visitors who are not signed in', async () => {
        await createWith(null);

        expect(questionReport('q3')).not.toBeNull();
        expect(questionReport('q2')).not.toBeNull();
        expect(answerReport('q2')).not.toBeNull();
      });

      it('has no answer REPORT on a question without an answer', async () => {
        await createWith('buyer-1');

        expect(answerReport('q3')).toBeNull();
        expect(itemFor('q3').querySelectorAll('.report-link').length).toBe(1);
      });

      it('stays available on a sold listing', async () => {
        await createWith('buyer-1', threeQuestions(), 'sold');

        expect(questionReport('q3')).not.toBeNull();
        expect(answerReport('q2')).not.toBeNull();
      });

      it('does not show the answer REPORT to the seller before it is known who is signed in', async () => {
        const session = deferred<{ data: { session: { user: { id: string } } } }>();
        service.getQuestions.mockResolvedValue(page([answered(2)], 1));
        isLoggedIn.set(true);
        auth.getSession.mockReturnValue(session.promise);

        await create('listing-1', 'published', 'seller-1');
        expect(answerReport('q2')).toBeNull();

        session.resolve({ data: { session: { user: { id: 'seller-1' } } } });
        await settle();

        // It was the seller: still no REPORT on their own answer.
        expect(answerReport('q2')).toBeNull();
      });

      it('names what each control reports, with the visible word first', async () => {
        await createWith('buyer-1', [
          question(3, { question: 'Is it true to size?' }),
          answered(2),
          question(1, { question: 'x'.repeat(80) }),
        ]);

        expect(questionReport('q3')!.getAttribute('aria-label')).toBe(
          'Report this question: Is it true to size?',
        );
        expect(answerReport('q2')!.getAttribute('aria-label')).toBe(
          'Report the answer to the question: Question 2',
        );
        expect(questionReport('q1')!.getAttribute('aria-label')).toBe(
          `Report this question: ${'x'.repeat(60)}…`,
        );
        expect(answerReport('q2')!.getAttribute('aria-label')!.toLowerCase()).toContain('report');
      });
    });

    describe('visitors who are not signed in', () => {
      it('get the login prompt for reporting instead of the modal', async () => {
        await createWith(null);

        await open(questionReport('q3'));

        expect(modal()).toBeNull();
        expect(loginPrompt()).not.toBeNull();
        expect(loginPrompt()!.textContent).toContain('Report content');
        expect(loginPrompt()!.textContent).toContain('report this content');
        expect(loginPrompt()!.querySelector('a[href="/login"]')).not.toBeNull();
        expect(service.reportContent).not.toHaveBeenCalled();
      });

      it("get it for the seller's answer too", async () => {
        await createWith(null);

        await open(answerReport('q2'));

        expect(modal()).toBeNull();
        expect(loginPrompt()).not.toBeNull();
      });

      it('get focus back on the REPORT control they pressed', async () => {
        await createWith(null);
        const button = questionReport('q3')!;

        await open(button);
        loginPrompt()!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        await settle();

        expect(loginPrompt()).toBeNull();
        expect(document.activeElement).toBe(button);
      });

      it('still get the question wording when they press "Ask a question"', async () => {
        await createWith(null);
        await open(questionReport('q3'));
        loginPrompt()!.querySelector<HTMLButtonElement>('.login-prompt-dismiss')!.click();
        await settle();

        await open(el.querySelector<HTMLButtonElement>('.ask-toggle'));

        expect(loginPrompt()!.textContent).toContain('Ask the seller');
        expect(loginPrompt()!.textContent).toContain('ask this seller a question');
        expect(loginPrompt()!.textContent).not.toContain('Report content');
      });

      it('send no report', async () => {
        await createWith(null);

        await open(questionReport('q3'));
        loginPrompt()!.querySelector<HTMLButtonElement>('.login-prompt-dismiss')!.click();
        await settle();

        expect(service.reportContent).not.toHaveBeenCalled();
        expect(questionReport('q3')!.textContent).toContain('REPORT');
        expect(questionReport('q3')!.textContent).not.toContain('REPORTED');
      });
    });

    describe('the modal', () => {
      it('opens, centred, when a signed-in reader presses REPORT', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(modal()).not.toBeNull();
        expect(modal()!.getAttribute('role')).toBe('dialog');
        expect(modal()!.getAttribute('aria-modal')).toBe('true');
        expect(el.querySelector('.login-prompt-overlay')!.contains(modal())).toBe(true);
        expect(loginPrompt()).toBeNull();
      });

      it('has the specified title and description', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        const title = modal()!.querySelector('h2')!;
        const description = modal()!.querySelector('#report-description')!;

        expect(title.textContent?.trim()).toBe('Report content');
        expect(description.textContent?.trim()).toBe(
          "Help us keep MEGURU a respectful space. Tell us why you're reporting this content.",
        );
        expect(modal()!.getAttribute('aria-labelledby')).toBe(title.id);
        expect(modal()!.getAttribute('aria-describedby')).toBe(description.id);
      });

      it('has a required reason dropdown with the four backend values and no preselection', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        const options = Array.from(reasonSelect()!.options);

        expect(reasonSelect()!.tagName).toBe('SELECT');
        expect(reasonSelect()!.value).toBe('');
        expect(
          options
            .filter((option) => option.value !== '')
            .map((o) => [o.value, o.textContent?.trim()]),
        ).toEqual([
          ['spam', 'Spam'],
          ['offensive', 'Offensive content'],
          ['misleading', 'Misleading information'],
          ['other', 'Other'],
        ]);
        // The only other option is the empty prompt.
        expect(options.length).toBe(5);
        expect(options[0].value).toBe('');
        expect(options.some((option) => option.selected && option.value !== '')).toBe(false);
      });

      it('has an optional details field limited to 300 characters, with a counter', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(detailsInput()!.tagName).toBe('TEXTAREA');
        expect(detailsInput()!.value).toBe('');
        expect(modal()!.querySelector('.ask-counter')!.textContent).toContain('0 / 300');

        await typeDetails('Looks like an advert');

        expect(modal()!.querySelector('.ask-counter')!.textContent).toContain('20 / 300');
      });

      it('labels both fields', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(modal()!.querySelector('label[for="report-reason"]')!.textContent).toContain(
          'REASON',
        );
        expect(modal()!.querySelector('label[for="report-details"]')!.textContent).toContain(
          'OPTIONAL',
        );
        expect(detailsInput()!.getAttribute('aria-describedby')).toContain(
          'report-details-counter',
        );
      });

      it('has CANCEL and SUBMIT REPORT, and an accessible close control', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(cancelButton()!.textContent).toContain('CANCEL');
        expect(submitButton()!.textContent).toContain('SUBMIT REPORT');
        expect(submitButton()!.getAttribute('type')).toBe('submit');
        expect(cancelButton()!.getAttribute('type')).toBe('button');
        expect(closeButton()!.getAttribute('aria-label')).toBe('Close');
        expect(closeButton()!.getAttribute('type')).toBe('button');
      });

      it('moves focus to the reason field', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(document.activeElement).toBe(reasonSelect());
      });

      it("opens for the seller's answer as well", async () => {
        await createWith('buyer-1');

        await open(answerReport('q2'));

        expect(modal()).not.toBeNull();
      });

      it('opens for a seller reporting a question on their own listing', async () => {
        await createWith('seller-1', [question(3)]);

        await open(questionReport('q3'));

        expect(modal()).not.toBeNull();
      });
    });

    describe('closing the modal', () => {
      it('closes with Escape and returns focus to the control that opened it', async () => {
        await createWith('buyer-1');
        const button = questionReport('q3')!;
        await open(button);

        const event = keydown('Escape');
        await settle();

        expect(event.defaultPrevented).toBe(true);
        expect(modal()).toBeNull();
        expect(document.activeElement).toBe(button);
        expect(service.reportContent).not.toHaveBeenCalled();
      });

      it('closes with CANCEL and returns focus', async () => {
        await createWith('buyer-1');
        const button = answerReport('q2')!;
        await open(button);

        cancelButton()!.click();
        await settle();

        expect(modal()).toBeNull();
        expect(document.activeElement).toBe(button);
      });

      it('closes with the close control and returns focus', async () => {
        await createWith('buyer-1');
        const button = questionReport('q3')!;
        await open(button);

        closeButton()!.click();
        await settle();

        expect(modal()).toBeNull();
        expect(document.activeElement).toBe(button);
      });

      it('throws the draft away when it is closed', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        await typeDetails('Something I typed');

        cancelButton()!.click();
        await settle();
        await open(questionReport('q3'));

        expect(reasonSelect()!.value).toBe('');
        expect(detailsInput()!.value).toBe('');
        expect(modal()!.querySelector('.ask-counter')!.textContent).toContain('0 / 300');
        expect(modalAlerts()).toBe('');
      });

      it('is not closed by a click on the dimmed background', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');

        el.querySelector<HTMLElement>('.login-prompt-overlay')!.click();
        await settle();

        expect(modal()).not.toBeNull();
        expect(reasonSelect()!.value).toBe('spam');
      });

      it('keeps Tab inside the modal, in both directions', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));

        const focusable = Array.from(
          modal()!.querySelectorAll<HTMLElement>('button, select, textarea, a[href]'),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        expect(first).toBe(closeButton());
        expect(last).toBe(submitButton());

        last.focus();
        const forward = keydown('Tab');
        expect(forward.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);

        first.focus();
        const backward = keydown('Tab', true);
        expect(backward.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
      });

      it('lets Tab move on normally from the middle of the modal', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));

        reasonSelect()!.focus();
        const event = keydown('Tab');

        expect(event.defaultPrevented).toBe(false);
      });
    });

    describe('validation', () => {
      it('asks for a reason and sends nothing without one', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));

        submitForm();
        await settle();

        expect(service.reportContent).not.toHaveBeenCalled();
        expect(modalAlerts()).toContain('Choose a reason');
        expect(reasonSelect()!.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(reasonSelect());
        expect(modal()).not.toBeNull();
      });

      it('shows no error on a fresh modal', async () => {
        await createWith('buyer-1');

        await open(questionReport('q3'));

        expect(modalAlerts()).toBe('');
        expect(reasonSelect()!.getAttribute('aria-invalid')).toBeNull();
      });

      it('sends no report with more than 300 characters of details, and says so', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        await typeDetails('x'.repeat(301));

        submitForm();
        await settle();

        expect(service.reportContent).not.toHaveBeenCalled();
        expect(modalAlerts()).toContain('at most 300');
        expect(detailsInput()!.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(detailsInput());
      });

      it('accepts exactly 300 characters of details', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        await typeDetails('x'.repeat(300));

        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledWith(
          'q3',
          'question',
          'spam',
          'x'.repeat(300),
        );
      });

      it('lets the details stay empty', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('other');

        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledTimes(1);
        expect(service.reportContent).toHaveBeenCalledWith('q3', 'question', 'other', '');
      });
    });

    describe('sending a report', () => {
      it('reports a question with the question id and target "question"', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        await typeDetails('Looks like an advert');

        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledTimes(1);
        expect(service.reportContent).toHaveBeenCalledWith(
          'q3',
          'question',
          'spam',
          'Looks like an advert',
        );
      });

      it('reports an answer with the question id and target "answer"', async () => {
        await createWith('buyer-1');
        await open(answerReport('q2'));
        await chooseReason('misleading');

        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledWith('q2', 'answer', 'misleading', '');
      });

      it.each(['spam', 'offensive', 'misleading', 'other'])(
        'sends the exact backend value "%s"',
        async (value) => {
          await createWith('buyer-1');
          await open(questionReport('q3'));
          await chooseReason(value);

          submitForm();
          await settle();

          expect(service.reportContent.mock.calls[0][2]).toBe(value);
        },
      );

      it('lets a seller report a question on their own listing', async () => {
        await createWith('seller-1', [question(3)]);
        await open(questionReport('q3'));
        await chooseReason('offensive');

        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledWith('q3', 'question', 'offensive', '');
      });

      it('disables submitting while the report is being sent', async () => {
        const pending = deferred<{ error: null }>();
        service.reportContent.mockReturnValue(pending.promise);
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');

        submitForm();
        fixture.detectChanges();

        expect(submitButton()!.getAttribute('aria-disabled')).toBe('true');
        expect(submitButton()!.getAttribute('aria-busy')).toBe('true');
        expect(submitButton()!.textContent).toContain('SENDING');
        expect(cancelButton()!.getAttribute('aria-disabled')).toBe('true');
        expect(closeButton()!.getAttribute('aria-disabled')).toBe('true');

        pending.resolve({ error: null });
        await settle();
      });

      it('prevents duplicate submissions', async () => {
        const pending = deferred<{ error: null }>();
        service.reportContent.mockReturnValue(pending.promise);
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');

        submitForm();
        submitForm();
        submitButton()!.click();
        fixture.detectChanges();
        submitForm();

        expect(service.reportContent).toHaveBeenCalledTimes(1);

        // The same through the component itself, whatever the browser does with events.
        void fixture.componentInstance.submitReport(new Event('submit'));
        void fixture.componentInstance.submitReport(new Event('submit'));

        expect(service.reportContent).toHaveBeenCalledTimes(1);

        pending.resolve({ error: null });
        await settle();

        expect(service.reportContent).toHaveBeenCalledTimes(1);
      });

      it('stays open, even if Escape, CANCEL or the close control are used while sending', async () => {
        const pending = deferred<{ error: null }>();
        service.reportContent.mockReturnValue(pending.promise);
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        submitForm();
        fixture.detectChanges();

        keydown('Escape');
        cancelButton()!.click();
        closeButton()!.click();
        fixture.detectChanges();

        expect(modal()).not.toBeNull();

        pending.resolve({ error: null });
        await settle();

        expect(modal()).toBeNull();
      });
    });

    describe('after a successful report', () => {
      const reportFirstQuestion = async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        submitForm();
        await settle();
      };

      it('closes the modal', async () => {
        await reportFirstQuestion();

        expect(modal()).toBeNull();
      });

      it('shows a small "Report sent" note next to the reported question', async () => {
        await reportFirstQuestion();

        const note = itemFor('q3').querySelector('.question-meta .report-notice');

        expect(note!.textContent).toContain('Report sent');
        // Only there, and not as a popup.
        expect(el.querySelectorAll('.report-notice').length).toBe(1);
        expect(el.querySelector('.success-dialog')).toBeNull();
        expect(el.querySelector('.success-overlay')).toBeNull();
        expect(liveMessage()).toContain('Report sent');
      });

      it('turns that REPORT into a disabled REPORTED', async () => {
        await reportFirstQuestion();

        const button = questionReport('q3')!;

        expect(button.textContent).toContain('REPORTED');
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.getAttribute('aria-label')).toBe('Question reported');
      });

      it('does not open anything when REPORTED is pressed', async () => {
        await reportFirstQuestion();

        questionReport('q3')!.click();
        await settle();

        expect(modal()).toBeNull();
        expect(loginPrompt()).toBeNull();
        expect(service.reportContent).toHaveBeenCalledTimes(1);
      });

      it('changes only that control, not the other ones', async () => {
        await reportFirstQuestion();

        expect(questionReport('q2')!.textContent).not.toContain('REPORTED');
        expect(answerReport('q2')!.textContent).not.toContain('REPORTED');
        expect(questionReport('q2')!.getAttribute('aria-disabled')).toBeNull();
        expect(itemFor('q2').querySelector('.report-notice')).toBeNull();
      });

      it('keeps the question and answer on the same item reportable separately', async () => {
        await createWith('buyer-1');
        await open(questionReport('q2'));
        await chooseReason('spam');
        submitForm();
        await settle();

        expect(questionReport('q2')!.textContent).toContain('REPORTED');
        expect(answerReport('q2')!.textContent).not.toContain('REPORTED');

        await open(answerReport('q2'));
        await chooseReason('offensive');
        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledTimes(2);
        expect(service.reportContent.mock.calls[1].slice(0, 3)).toEqual([
          'q2',
          'answer',
          'offensive',
        ]);
        expect(answerReport('q2')!.textContent).toContain('REPORTED');
        expect(answerReport('q2')!.getAttribute('aria-label')).toBe('Answer reported');
      });

      it('does not hide or remove the reported content', async () => {
        await reportFirstQuestion();

        expect(items().length).toBe(3);
        expect(itemFor('q3').querySelector('.question-text')!.textContent).toBe('Question 3');
        expect(service.getQuestions).toHaveBeenCalledTimes(1);
      });

      it('says nothing about removal or review', async () => {
        await reportFirstQuestion();

        const text = (el.textContent ?? '').toLowerCase();

        expect(text).not.toContain('removed');
        expect(text).not.toContain('reviewed');
        expect(text).not.toContain('under review');
        expect(text).not.toContain('taken down');
      });

      it('returns focus to the control, which now reads REPORTED', async () => {
        await reportFirstQuestion();

        expect(document.activeElement).toBe(questionReport('q3'));
      });

      it('shows the note next to a reported answer', async () => {
        await createWith('buyer-1');
        await open(answerReport('q2'));
        await chooseReason('spam');
        submitForm();
        await settle();

        expect(itemFor('q2').querySelector('.answer-meta .report-notice')!.textContent).toContain(
          'Report sent',
        );
      });

      it('replaces the note when another item is reported', async () => {
        await reportFirstQuestion();

        await open(answerReport('q2'));
        expect(el.querySelector('.report-notice')).toBeNull();
      });
    });

    describe('when the same item was reported before', () => {
      it('closes the modal, says so, and marks the item as reported', async () => {
        service.reportContent.mockResolvedValue({ error: { message: 'already_reported' } });
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');

        submitForm();
        await settle();

        expect(modal()).toBeNull();
        expect(itemFor('q3').querySelector('.report-notice')!.textContent).toContain(
          "You've already reported this.",
        );
        expect(questionReport('q3')!.textContent).toContain('REPORTED');
        expect(questionReport('q3')!.getAttribute('aria-disabled')).toBe('true');
        expect(liveMessage()).toContain("You've already reported this.");
        // It is not shown as a failure.
        expect(el.querySelector('[role="alert"]')).toBeNull();
      });
    });

    describe('when the report fails', () => {
      const failWith = async (error: { message: string; code?: string }) => {
        service.reportContent.mockResolvedValue({ error });
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('misleading');
        await typeDetails('This is not what it looks like');
        submitForm();
        await settle();
      };

      it.each([
        ['report_rate_limited', 'daily reporting limit'],
        ['not_reportable', 'can no longer be reported'],
        ['own_content', 'cannot report your own content'],
        ['not_authenticated', 'log in'],
        ['invalid_length', 'at most 300'],
        ['invalid_text', 'not allowed'],
      ])('explains %s in plain words', async (key, text) => {
        await failWith({ message: key });

        expect(modalAlerts().toLowerCase()).toContain(text);
        // No raw error key is shown.
        expect(el.textContent).not.toContain(key);
      });

      it('offers a Log in link when the person is not signed in', async () => {
        await failWith({ message: 'not_authenticated' });

        expect(modal()!.querySelector('a[href="/login"]')).not.toBeNull();
      });

      it('offers no Log in link for other errors', async () => {
        await failWith({ message: 'report_rate_limited' });

        expect(modal()!.querySelector('a[href="/login"]')).toBeNull();
      });

      it('offers no Log in link for own_content, although it shares its error code with a missing permission', async () => {
        await failWith({ message: 'own_content', code: '42501' });

        expect(modalAlerts().toLowerCase()).toContain('cannot report your own content');
        expect(modal()!.querySelector('a[href="/login"]')).toBeNull();
      });

      it('asks to log in when the request was not signed in', async () => {
        await failWith({
          message: 'permission denied for function report_listing_content',
          code: '42501',
        });

        expect(modalAlerts().toLowerCase()).toContain('log in');
        expect(modal()!.querySelector('a[href="/login"]')).not.toBeNull();
      });

      it('shows a general message for anything unexpected', async () => {
        await failWith({ message: 'something odd happened' });

        expect(modalAlerts()).toContain('Could not send your report. Please try again.');
        expect(modalAlerts()).not.toContain('something odd happened');
      });

      it('keeps the modal open with the reason and the details', async () => {
        await failWith({ message: 'report_rate_limited' });

        expect(modal()).not.toBeNull();
        expect(reasonSelect()!.value).toBe('misleading');
        expect(detailsInput()!.value).toBe('This is not what it looks like');
        expect(submitButton()!.getAttribute('aria-disabled')).toBeNull();
        expect(submitButton()!.textContent).toContain('SUBMIT REPORT');
      });

      it('does not mark anything as reported, or show a note', async () => {
        await failWith({ message: 'not_reportable' });

        expect(questionReport('q3')!.textContent).not.toContain('REPORTED');
        expect(el.querySelector('.report-notice')).toBeNull();
      });

      it('lets the person try again', async () => {
        await failWith({ message: 'report_rate_limited' });

        service.reportContent.mockResolvedValue({ error: null });
        submitForm();
        await settle();

        expect(service.reportContent).toHaveBeenCalledTimes(2);
        expect(modal()).toBeNull();
        expect(questionReport('q3')!.textContent).toContain('REPORTED');
      });

      it('announces the error to screen readers', async () => {
        await failWith({ message: 'not_reportable' });

        expect(modal()!.querySelector('[role="alert"]')).not.toBeNull();
      });
    });

    describe('when things change around the modal', () => {
      it('forgets the "Report sent" note, but remembers what was reported, when the person leaves and comes back', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        submitForm();
        await settle();
        expect(el.querySelector('.report-notice')).not.toBeNull();

        service.getQuestions.mockResolvedValue(page([question(30)], 1));
        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        expect(questionReport('q30')!.textContent).not.toContain('REPORTED');

        service.getQuestions.mockResolvedValue(page(threeQuestions(), 3));
        fixture.componentRef.setInput('listingId', 'listing-1');
        fixture.detectChanges();
        await settle();

        // Nothing is opened or announced again, and the earlier report still shows.
        expect(modal()).toBeNull();
        expect(el.querySelector('.report-notice')).toBeNull();
        expect(questionReport('q3')!.textContent).toContain('REPORTED');
        expect(questionReport('q3')!.getAttribute('aria-disabled')).toBe('true');
      });

      it('closes an open modal when the listing changes', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        expect(modal()).not.toBeNull();

        service.getQuestions.mockResolvedValue(page([question(30)], 1));
        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        expect(modal()).toBeNull();
        expect(service.reportContent).not.toHaveBeenCalled();

        // It opens empty for the new listing.
        await open(questionReport('q30'));

        expect(reasonSelect()!.value).toBe('');
      });

      it('ignores a result that arrives after the visitor moved to another listing', async () => {
        const pending = deferred<{ error: null }>();
        service.reportContent.mockReturnValue(pending.promise);
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        submitForm();

        service.getQuestions.mockResolvedValue(page([question(30)], 1));
        fixture.componentRef.setInput('listingId', 'listing-2');
        fixture.detectChanges();
        await settle();

        pending.resolve({ error: null });
        await settle();

        expect(modal()).toBeNull();
        expect(el.querySelector('.report-notice')).toBeNull();
        expect(el.textContent).not.toContain('Report sent');
      });

      it('closes it, and forgets what was reported, when the person signs out', async () => {
        await createWith('buyer-1');
        await open(questionReport('q3'));
        await chooseReason('spam');
        submitForm();
        await settle();
        await open(questionReport('q2'));
        expect(modal()).not.toBeNull();

        signOut();
        await settle();

        expect(modal()).toBeNull();
        expect(questionReport('q3')!.textContent).not.toContain('REPORTED');
        expect(el.querySelector('.report-notice')).toBeNull();
      });
    });

    describe('what stays the same', () => {
      it('still shows the questions, answers and pagination', async () => {
        await createWith('buyer-1', [question(9), answered(8, 'An answer.'), question(7)]);

        expect(items().length).toBe(3);
        expect(itemFor('q8').querySelector('.answer-text')!.textContent).toBe('An answer.');
        expect(itemFor('q9').querySelector('.question-meta')!.textContent).toContain(
          'MEGURU MEMBER',
        );
        expect(itemFor('q9').querySelector('time')!.textContent?.trim()).toBe('9 Nov 2026');
      });

      it('still lets a buyer ask a question', async () => {
        await createWith('buyer-1');

        expect(el.querySelector('.ask-toggle')).not.toBeNull();
      });

      it('still lets the seller reply, next to the REPORT control on the question', async () => {
        await createWith('seller-1', [question(3)]);

        expect(el.querySelector('[data-reply-button="q3"]')).not.toBeNull();
        expect(questionReport('q3')).not.toBeNull();
      });
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
