import {
  ANSWER_MAX_LENGTH,
  ANSWER_QUESTION_FALLBACK_ERROR,
  answerQuestionErrorMessage,
  ASK_QUESTION_FALLBACK_ERROR,
  askQuestionErrorMessage,
  QUESTION_MAX_LENGTH,
} from './listing-question';

describe('answerQuestionErrorMessage', () => {
  it('uses a limit of 500 characters, like the database', () => {
    expect(ANSWER_MAX_LENGTH).toBe(500);
  });

  it.each([
    ['not_authenticated', 'log in'],
    ['not_answerable', 'cannot reply to this question'],
    ['listing_not_open', 'not open for replies'],
    ['invalid_length', 'between 1 and 500 characters'],
    ['invalid_text', 'not allowed'],
  ])('explains the database message %s', (key, text) => {
    const message = answerQuestionErrorMessage({ message: key });

    expect(message).toContain(text);
    expect(message).not.toContain(key);
  });

  it('prefers the message key over the error code', () => {
    // not_answerable is raised with the same code (42501) as a missing permission.
    expect(answerQuestionErrorMessage({ message: 'not_answerable', code: '42501' })).toContain(
      'cannot reply to this question',
    );
  });

  it('asks the seller to log in when the request was not allowed to call the function', () => {
    expect(
      answerQuestionErrorMessage({
        message: 'permission denied for function answer_listing_question',
        code: '42501',
      }),
    ).toContain('log in');
  });

  it('asks the seller to log in when the session has expired', () => {
    expect(answerQuestionErrorMessage({ message: 'JWT expired', code: 'PGRST301' })).toContain(
      'log in',
    );
  });

  it('does not use the question messages for replies', () => {
    // A buyer-only message must never reach the seller.
    expect(answerQuestionErrorMessage({ message: 'too_many_unanswered' })).toBe(
      ANSWER_QUESTION_FALLBACK_ERROR,
    );
    expect(answerQuestionErrorMessage({ message: 'own_listing' })).toBe(
      ANSWER_QUESTION_FALLBACK_ERROR,
    );
  });

  it('falls back to a general message and never shows the raw error', () => {
    for (const error of [
      { message: 'something odd happened' },
      // Names that exist on every object must not be mistaken for message keys.
      { message: 'constructor' },
      { message: 'toString' },
      { code: '500' },
      {},
      null,
      undefined,
    ]) {
      expect(answerQuestionErrorMessage(error)).toBe(ANSWER_QUESTION_FALLBACK_ERROR);
    }
  });
});

describe('askQuestionErrorMessage', () => {
  it('uses a limit of 300 characters, like the database', () => {
    expect(QUESTION_MAX_LENGTH).toBe(300);
  });

  it.each([
    ['not_authenticated', 'log in'],
    ['listing_not_open', 'no longer accepting questions'],
    ['own_listing', 'your own listing'],
    ['invalid_length', 'between 1 and 300 characters'],
    ['invalid_text', 'not allowed'],
    ['too_many_unanswered', '3 unanswered questions'],
    ['rate_limited_hour', 'last hour'],
    ['rate_limited_day', 'daily question limit'],
  ])('explains the database message %s', (key, text) => {
    const message = askQuestionErrorMessage({ message: key });

    expect(message).toContain(text);
    expect(message).not.toContain(key);
  });

  it('prefers the message key over the error code', () => {
    // own_listing is raised with the same code (42501) as a missing permission.
    expect(askQuestionErrorMessage({ message: 'own_listing', code: '42501' })).toContain(
      'your own listing',
    );
  });

  it('asks the buyer to log in when the request was not allowed to call the function', () => {
    expect(
      askQuestionErrorMessage({
        message: 'permission denied for function ask_listing_question',
        code: '42501',
      }),
    ).toContain('log in');
  });

  it('asks the buyer to log in when the session has expired', () => {
    expect(askQuestionErrorMessage({ message: 'JWT expired', code: 'PGRST301' })).toContain(
      'log in',
    );
    expect(askQuestionErrorMessage({ message: 'Invalid JWT' })).toContain('log in');
  });

  it('falls back to a general message and never shows the raw error', () => {
    for (const error of [
      { message: 'something odd happened' },
      { code: '500' },
      {},
      null,
      undefined,
    ]) {
      expect(askQuestionErrorMessage(error)).toBe(ASK_QUESTION_FALLBACK_ERROR);
    }
  });
});
