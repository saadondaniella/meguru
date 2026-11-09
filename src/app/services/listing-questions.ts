import { Service, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import {
  ListingQuestion,
  ListingQuestionsPage,
  PostedAnswer,
  PostedQuestion,
  ReportReason,
  ReportTarget,
} from '../models/listing-question';

type QuestionsError = { message: string; code?: string };
type ReportResult = { error: QuestionsError | null };
type QuestionsResult = { data: ListingQuestionsPage | null; error: QuestionsError | null };
type AskResult = { data: PostedQuestion | null; error: QuestionsError | null };
type AnswerResult = { data: PostedAnswer | null; error: QuestionsError | null };

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

  // Get unanswered question counts for the signed-in seller's published listings.
  async getUnansweredCounts(): Promise<{
    data: { listing_id: string; unanswered_count: number }[] | null;
    error: QuestionsError | null;
  }> {
    try {
      const { data, error } = await this.supabase.rpc('get_seller_unanswered_questions');

      if (error) return { data: null, error };

      return {
        data: (data ?? []).map(
          (row: { listing_id: string; unanswered_count: number | string }) => ({
            listing_id: row.listing_id,
            unanswered_count: Number(row.unanswered_count),
          }),
        ),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Could not load unanswered questions.',
        },
      };
    }
  }

  // Asks a question through the ask_listing_question function, which checks
  // everything again on the server: that the user is signed in, that the
  // listing is published and not their own, the length, and the rate limits.
  // The questions table is never written directly.
  async askQuestion(listingId: string, question: string): Promise<AskResult> {
    try {
      const { data, error } = await this.supabase.rpc('ask_listing_question', {
        p_listing_id: listingId,
        p_question: question,
      });

      if (error) return { data: null, error };

      // The function returns one row for the new question.
      const row = (Array.isArray(data) ? data[0] : data) as PostedQuestion | null | undefined;

      if (!row) {
        return { data: null, error: { message: 'No question was returned.' } };
      }

      return {
        data: { id: row.id, question: row.question, created_at: row.created_at },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Could not post your question.',
        },
      };
    }
  }

  // Saves the seller's reply to a question (a first reply, or a change to an
  // existing one) through the answer_listing_question function. The database
  // decides who may reply: only the owner of the listing, only while it is
  // published. The questions table is never written directly.
  async answerQuestion(questionId: string, answer: string): Promise<AnswerResult> {
    try {
      const { data, error } = await this.supabase.rpc('answer_listing_question', {
        p_question_id: questionId,
        p_answer: answer,
      });

      if (error) return { data: null, error };

      // The function returns one row with the saved reply and its timestamps.
      const row = (Array.isArray(data) ? data[0] : data) as PostedAnswer | null | undefined;

      if (!row) {
        return { data: null, error: { message: 'No reply was returned.' } };
      }

      return {
        data: {
          id: row.id,
          answer: row.answer,
          answered_at: row.answered_at,
          answer_updated_at: row.answer_updated_at ?? null,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Could not save your reply.',
        },
      };
    }
  }

  // Reports a question or the seller's answer through the
  // report_listing_content function. Both targets use the id of the question.
  // The function returns nothing: no error means the report was saved. The
  // database decides who may report what (for example not your own content),
  // limits reports and ignores repeats. The reports table is never written
  // directly, and cannot be read by clients.
  async reportContent(
    questionId: string,
    target: ReportTarget,
    reason: ReportReason,
    details: string | null,
  ): Promise<ReportResult> {
    try {
      const { error } = await this.supabase.rpc('report_listing_content', {
        p_question_id: questionId,
        p_target: target,
        p_reason: reason,
        // Optional text: trimmed, and nothing at all when it is empty.
        p_details: details?.trim() ? details.trim() : null,
      });

      return { error: error ?? null };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'Could not send your report.',
        },
      };
    }
  }
}
