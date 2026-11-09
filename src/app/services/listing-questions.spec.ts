import { TestBed } from '@angular/core/testing';
import { ListingQuestionsService } from './listing-questions';
import { SUPABASE_CLIENT } from './supabase';

describe('ListingQuestionsService', () => {
  const rpc = vi.fn();
  // Only rpc exists on this fake client: any direct table access
  // (supabase.from(...)) would throw, which proves everything goes through the RPC.
  const supabase = { rpc };

  let service: ListingQuestionsService;

  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    question: `Question ${id}`,
    created_at: '2026-11-01T10:00:00Z',
    answer: null,
    answered_at: null,
    answer_updated_at: null,
    is_own: false,
    total_count: 7,
    ...overrides,
  });

  beforeEach(() => {
    rpc.mockReset();

    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE_CLIENT, useValue: supabase }],
    });

    service = TestBed.inject(ListingQuestionsService);
  });

  it('calls the get_listing_questions function with the listing, limit and offset', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await service.getQuestions('listing-1', 5, 10);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_listing_questions', {
      p_listing_id: 'listing-1',
      p_limit: 5,
      p_offset: 10,
    });
  });

  it('returns the questions and the total of the listing', async () => {
    rpc.mockResolvedValue({
      data: [
        row('a', { answer: 'Yes.', answered_at: '2026-11-02T10:00:00Z' }),
        row('b', { is_own: true }),
      ],
      error: null,
    });

    const { data, error } = await service.getQuestions('listing-1', 3, 0);

    expect(error).toBeNull();
    expect(data?.total).toBe(7);
    expect(data?.questions.map((question) => question.id)).toEqual(['a', 'b']);
    expect(data?.questions[0]).toMatchObject({
      question: 'Question a',
      answer: 'Yes.',
      answered_at: '2026-11-02T10:00:00Z',
      answer_updated_at: null,
      is_own: false,
    });
    expect(data?.questions[1].is_own).toBe(true);
  });

  it('keeps total_count out of the questions and reads it as a number', async () => {
    // A bigint can arrive as a string.
    rpc.mockResolvedValue({ data: [row('a', { total_count: '12' })], error: null });

    const { data } = await service.getQuestions('listing-1', 3, 0);

    expect(data?.total).toBe(12);
    expect(data?.questions[0]).not.toHaveProperty('total_count');
  });

  it('never passes on an asker id, even if a row contained one', async () => {
    rpc.mockResolvedValue({
      data: [row('a', { asker_id: 'user-1' })],
      error: null,
    });

    const { data } = await service.getQuestions('listing-1', 3, 0);

    expect(data?.questions[0]).not.toHaveProperty('asker_id');
  });

  it('returns an empty page when there are no rows', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const { data, error } = await service.getQuestions('listing-1', 3, 0);

    expect(error).toBeNull();
    expect(data).toEqual({ questions: [], total: 0 });
  });

  it('treats null data as an empty page', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const { data } = await service.getQuestions('listing-1', 3, 0);

    expect(data).toEqual({ questions: [], total: 0 });
  });

  it('returns the error of the database call', async () => {
    const failure = { message: 'boom', code: '500' };
    rpc.mockResolvedValue({ data: null, error: failure });

    const result = await service.getQuestions('listing-1', 3, 0);

    expect(result.data).toBeNull();
    expect(result.error).toBe(failure);
  });

  it('turns a thrown error into an error result', async () => {
    rpc.mockRejectedValue(new Error('network down'));

    const result = await service.getQuestions('listing-1', 3, 0);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: 'network down' });
  });

  describe('askQuestion', () => {
    const newRow = { id: 'q1', question: 'Is it available?', created_at: '2026-11-10T10:00:00Z' };

    it('calls the ask_listing_question function with the listing and the question', async () => {
      rpc.mockResolvedValue({ data: [newRow], error: null });

      await service.askQuestion('listing-1', 'Is it available?');

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('ask_listing_question', {
        p_listing_id: 'listing-1',
        p_question: 'Is it available?',
      });
    });

    it('returns the new question', async () => {
      rpc.mockResolvedValue({ data: [newRow], error: null });

      const { data, error } = await service.askQuestion('listing-1', 'Is it available?');

      expect(error).toBeNull();
      expect(data).toEqual(newRow);
    });

    it('also accepts a single row instead of a list', async () => {
      rpc.mockResolvedValue({ data: newRow, error: null });

      const { data } = await service.askQuestion('listing-1', 'Is it available?');

      expect(data).toEqual(newRow);
    });

    it('passes on only the id, text and date of the new question', async () => {
      rpc.mockResolvedValue({ data: [{ ...newRow, asker_id: 'user-1' }], error: null });

      const { data } = await service.askQuestion('listing-1', 'Is it available?');

      expect(data).not.toHaveProperty('asker_id');
    });

    it('returns the error when the database refuses the question', async () => {
      const refusal = { message: 'too_many_unanswered', code: 'P0001' };
      rpc.mockResolvedValue({ data: null, error: refusal });

      const result = await service.askQuestion('listing-1', 'Is it available?');

      expect(result.data).toBeNull();
      expect(result.error).toBe(refusal);
    });

    it('reports an error when nothing comes back', async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      const result = await service.askQuestion('listing-1', 'Is it available?');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });

    it('turns a thrown error into an error result', async () => {
      rpc.mockRejectedValue(new Error('network down'));

      const result = await service.askQuestion('listing-1', 'Is it available?');

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'network down' });
    });

    it('goes through the RPC only: the fake client has no table access', async () => {
      rpc.mockResolvedValue({ data: [newRow], error: null });

      // The fake client only has rpc(). A direct insert (supabase.from(...))
      // would throw and surface as an error.
      const { error } = await service.askQuestion('listing-1', 'Is it available?');

      expect(error).toBeNull();
      expect(Object.keys(supabase)).toEqual(['rpc']);
    });
  });

  describe('answerQuestion', () => {
    const savedRow = {
      id: 'q1',
      answer: 'Yes, it fits.',
      answered_at: '2026-11-04T10:00:00Z',
      answer_updated_at: null,
    };

    it('calls the answer_listing_question function with the question and the reply', async () => {
      rpc.mockResolvedValue({ data: [savedRow], error: null });

      await service.answerQuestion('q1', 'Yes, it fits.');

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('answer_listing_question', {
        p_question_id: 'q1',
        p_answer: 'Yes, it fits.',
      });
    });

    it('returns the saved reply with the timestamps from the database', async () => {
      rpc.mockResolvedValue({
        data: [{ ...savedRow, answer_updated_at: '2026-11-09T10:00:00Z' }],
        error: null,
      });

      const { data, error } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(error).toBeNull();
      expect(data).toEqual({
        id: 'q1',
        answer: 'Yes, it fits.',
        answered_at: '2026-11-04T10:00:00Z',
        answer_updated_at: '2026-11-09T10:00:00Z',
      });
    });

    it('returns no edit timestamp for a first reply', async () => {
      rpc.mockResolvedValue({ data: [savedRow], error: null });

      const { data } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(data?.answer_updated_at).toBeNull();
    });

    it('treats a missing edit timestamp as empty', async () => {
      const { answer_updated_at: omitted, ...withoutTimestamp } = savedRow;
      void omitted;
      rpc.mockResolvedValue({ data: [withoutTimestamp], error: null });

      const { data } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(data?.answer_updated_at).toBeNull();
    });

    it('also accepts a single row instead of a list', async () => {
      rpc.mockResolvedValue({ data: savedRow, error: null });

      const { data } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(data?.answer).toBe('Yes, it fits.');
    });

    it('passes on only the reply fields', async () => {
      rpc.mockResolvedValue({ data: [{ ...savedRow, asker_id: 'user-1' }], error: null });

      const { data } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(data).not.toHaveProperty('asker_id');
    });

    it('returns the error when the database refuses the reply', async () => {
      const refusal = { message: 'listing_not_open', code: 'P0002' };
      rpc.mockResolvedValue({ data: null, error: refusal });

      const result = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(result.data).toBeNull();
      expect(result.error).toBe(refusal);
    });

    it('reports an error when nothing comes back', async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      const result = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
    });

    it('turns a thrown error into an error result', async () => {
      rpc.mockRejectedValue(new Error('network down'));

      const result = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(result.data).toBeNull();
      expect(result.error).toEqual({ message: 'network down' });
    });

    it('goes through the RPC only: the fake client has no table access', async () => {
      rpc.mockResolvedValue({ data: [savedRow], error: null });

      const { error } = await service.answerQuestion('q1', 'Yes, it fits.');

      expect(error).toBeNull();
      expect(Object.keys(supabase)).toEqual(['rpc']);
    });
  });
});
