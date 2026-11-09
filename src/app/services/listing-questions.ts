import { Service, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import { ListingQuestion, ListingQuestionsPage } from '../models/listing-question';

type QuestionsError = { message: string; code?: string };
type QuestionsResult = { data: ListingQuestionsPage | null; error: QuestionsError | null };

// A row of get_listing_questions. total_count is a bigint, which may arrive as
// a number or a string.
interface QuestionRow extends ListingQuestion {
  total_count: number | string;
}

@Service()
export class ListingQuestionsService {
  private supabase = inject(SUPABASE_CLIENT);

  // One page of public questions, newest first. All access goes through the
  // get_listing_questions function: the questions table itself is locked.
  async getQuestions(listingId: string, limit: number, offset: number): Promise<QuestionsResult> {
    try {
      const { data, error } = await this.supabase.rpc('get_listing_questions', {
        p_listing_id: listingId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) return { data: null, error };

      const rows = (data ?? []) as QuestionRow[];

      return {
        data: {
          questions: rows.map((row) => ({
            id: row.id,
            question: row.question,
            created_at: row.created_at,
            answer: row.answer,
            answered_at: row.answered_at,
            answer_updated_at: row.answer_updated_at,
            is_own: row.is_own,
          })),
          // Every row carries the same total. Without rows it is unknown.
          total: rows.length > 0 ? Number(rows[0].total_count) : 0,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Could not load questions.',
        },
      };
    }
  }
}
