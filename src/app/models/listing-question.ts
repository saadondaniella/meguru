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

// The database enforces the same limit (1 to 300 characters, trimmed).
export const QUESTION_MAX_LENGTH = 300;

// What ask_listing_question returns for the new question.
export interface PostedQuestion {
  id: string;
  question: string;
  created_at: string;
}

export const ASK_QUESTION_FALLBACK_ERROR = 'Could not post your question. Please try again.';

// The database refuses a question with a stable message key. These are the
// texts shown to the visitor for each key.
const ASK_QUESTION_ERRORS: Record<string, string> = {
  not_authenticated: 'Please log in to ask a question.',
  listing_not_open: 'This listing is no longer accepting questions.',
  own_listing: 'You cannot ask a question on your own listing.',
  invalid_length: `Your question must be between 1 and ${QUESTION_MAX_LENGTH} characters.`,
  invalid_text: 'Your question contains characters that are not allowed.',
  too_many_unanswered:
    'You already have 3 unanswered questions on this listing. Please wait for the seller to answer.',
  rate_limited_hour: 'You have asked a lot of questions in the last hour. Please try again later.',
  rate_limited_day: 'You have reached the daily question limit. Please try again tomorrow.',
};

type DatabaseError = { message?: string; code?: string } | null | undefined;

// A request that is not signed in (or whose session ran out) is refused by the
// API before it reaches the function.
function isNotSignedInError(error: DatabaseError): boolean {
  return error?.code === '42501' || error?.code === 'PGRST301' || /jwt/i.test(error?.message ?? '');
}

// Own keys only, so a message such as "constructor" is never mistaken for one.
function knownMessage(messages: Record<string, string>, error: DatabaseError): string | null {
  const key = error?.message ?? '';

  return Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
}

export function askQuestionErrorMessage(error: DatabaseError): string {
  const known = knownMessage(ASK_QUESTION_ERRORS, error);

  if (known) return known;

  if (isNotSignedInError(error)) return 'Please log in to ask a question.';

  return ASK_QUESTION_FALLBACK_ERROR;
}

// SELLER REPLIES

// The database enforces the same limit (1 to 500 characters, trimmed).
export const ANSWER_MAX_LENGTH = 500;

// What answer_listing_question returns after a reply was saved. The
// timestamps come from the database: answered_at is set by the first reply and
// never changes, and answer_updated_at is set only when a reply was changed.
export interface PostedAnswer {
  id: string;
  answer: string;
  answered_at: string;
  answer_updated_at: string | null;
}

export const ANSWER_QUESTION_FALLBACK_ERROR = 'Could not save your reply. Please try again.';

const ANSWER_QUESTION_ERRORS: Record<string, string> = {
  not_authenticated: 'Please log in to reply.',
  not_answerable: 'You cannot reply to this question.',
  listing_not_open: 'This listing is not open for replies any more.',
  invalid_length: `Your reply must be between 1 and ${ANSWER_MAX_LENGTH} characters.`,
  invalid_text: 'Your reply contains characters that are not allowed.',
};

export function answerQuestionErrorMessage(error: DatabaseError): string {
  const known = knownMessage(ANSWER_QUESTION_ERRORS, error);

  if (known) return known;

  if (isNotSignedInError(error)) return 'Please log in to reply.';

  return ANSWER_QUESTION_FALLBACK_ERROR;
}
