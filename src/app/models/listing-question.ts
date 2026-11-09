// One public question on a listing, as returned by the get_listing_questions
// database function. The asker is never part of it: all askers are shown as
// "MEGURU member", and asker_id is not exposed by the database.
export interface ListingQuestion {
  id: string;
  question: string;
  created_at: string;
  answer: string | null;
  answered_at: string | null;
  // Set only when the seller changed an existing answer ("Edited").
  answer_updated_at: string | null;
  // True for the signed-in user's own questions. Not used by the read-only UI.
  is_own: boolean;
}

export interface ListingQuestionsPage {
  questions: ListingQuestion[];
  // Number of visible questions on the listing (all pages together).
  total: number;
}

export const QUESTIONS_INITIAL_PAGE_SIZE = 3;
export const QUESTIONS_PAGE_SIZE = 5;
