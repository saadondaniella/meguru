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
});
