import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingStatus } from '../../models/listing';
import { ListingQuestion } from '../../models/listing-question';
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

  const service = { getQuestions: vi.fn() };

  // Lets the component's promise chains finish and renders the result.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const create = async (listingId = 'listing-1', status: ListingStatus = 'published') => {
    fixture = TestBed.createComponent(ListingQuestions);
    fixture.componentRef.setInput('listingId', listingId);
    fixture.componentRef.setInput('status', status);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  };

  const items = () => Array.from(el.querySelectorAll<HTMLElement>('.question-item'));
  const showMoreButton = () => el.querySelector<HTMLButtonElement>('.show-more');

  beforeEach(() => {
    service.getQuestions.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      imports: [ListingQuestions],
      providers: [{ provide: ListingQuestionsService, useValue: service }],
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
    el.querySelector<HTMLButtonElement>('.questions-button')!.click();
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
