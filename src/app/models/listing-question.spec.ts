import {
  ASK_QUESTION_FALLBACK_ERROR,
  askQuestionErrorMessage,
  QUESTION_MAX_LENGTH,
} from './listing-question';

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
