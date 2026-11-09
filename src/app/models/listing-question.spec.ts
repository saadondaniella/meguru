import {
  ANSWER_MAX_LENGTH,
  ANSWER_QUESTION_FALLBACK_ERROR,
  answerQuestionErrorMessage,
  ASK_QUESTION_FALLBACK_ERROR,
  askQuestionErrorMessage,
  isAlreadyReportedError,
  isReportLoginError,
  QUESTION_MAX_LENGTH,
  REPORT_ALREADY_REPORTED,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_FALLBACK_ERROR,
  REPORT_REASONS,
  reportErrorMessage,
} from './listing-question';

describe('report reasons', () => {
  it('has exactly the four values the database accepts, in this order', () => {
    expect(REPORT_REASONS.map((reason) => reason.value)).toEqual([
      'spam',
      'offensive',
      'misleading',
      'other',
    ]);
  });

  it('shows these words to people', () => {
    expect(REPORT_REASONS.map((reason) => reason.label)).toEqual([
      'Spam',
      'Offensive content',
      'Misleading information',
      'Other',
    ]);
  });

  it('uses a details limit of 300 characters, like the database', () => {
    expect(REPORT_DETAILS_MAX_LENGTH).toBe(300);
  });
});

describe('reportErrorMessage', () => {
  it.each([
    ['not_authenticated', 'log in'],
    ['already_reported', "You've already reported this."],
    ['report_rate_limited', 'daily reporting limit'],
    ['not_reportable', 'can no longer be reported'],
    ['own_content', 'cannot report your own content'],
    ['invalid_length', 'at most 300 characters'],
    ['invalid_text', 'not allowed'],
  ])('explains the database message %s', (key, text) => {
    const message = reportErrorMessage({ message: key });

    expect(message).toContain(text);
    expect(message).not.toContain(key);
  });

  it('uses the same words for "already reported" everywhere', () => {
    expect(reportErrorMessage({ message: 'already_reported' })).toBe(REPORT_ALREADY_REPORTED);
  });

  it('prefers the message key over the error code', () => {
    // own_content is raised with the same code (42501) as a missing permission.
    expect(reportErrorMessage({ message: 'own_content', code: '42501' })).toContain(
      'cannot report your own content',
    );
  });

  it('asks the person to log in when the request was not allowed to call the function', () => {
    expect(
      reportErrorMessage({
        message: 'permission denied for function report_listing_content',
        code: '42501',
      }),
    ).toContain('log in');
    expect(reportErrorMessage({ message: 'JWT expired', code: 'PGRST301' })).toContain('log in');
  });

  it('does not use the reply or question messages for reports', () => {
    expect(reportErrorMessage({ message: 'too_many_unanswered' })).toBe(REPORT_FALLBACK_ERROR);
    expect(reportErrorMessage({ message: 'not_answerable' })).toBe(REPORT_FALLBACK_ERROR);
  });

  it('falls back to a general message and never shows the raw error', () => {
    for (const error of [
      { message: 'something odd happened' },
      // The backend only raises invalid_report if the app sends a bad value.
      { message: 'invalid_report' },
      { message: 'constructor' },
      { message: 'toString' },
      { code: '500' },
      {},
      null,
      undefined,
    ]) {
      expect(reportErrorMessage(error)).toBe(REPORT_FALLBACK_ERROR);
    }
  });

  it('does not claim that anything was removed or reviewed', () => {
    for (const key of [
      'not_authenticated',
      'already_reported',
      'report_rate_limited',
      'not_reportable',
      'own_content',
      'invalid_length',
      'invalid_text',
    ]) {
      expect(reportErrorMessage({ message: key }).toLowerCase()).not.toMatch(
        /removed|reviewed|taken down|deleted/,
      );
    }
  });
});

describe('isAlreadyReportedError', () => {
  it('recognises only the already_reported message', () => {
    expect(isAlreadyReportedError({ message: 'already_reported' })).toBe(true);
    expect(isAlreadyReportedError({ message: 'report_rate_limited' })).toBe(false);
    expect(isAlreadyReportedError({ code: 'P0001' })).toBe(false);
    expect(isAlreadyReportedError(null)).toBe(false);
    expect(isAlreadyReportedError(undefined)).toBe(false);
  });
});

describe('isReportLoginError', () => {
  it('is true when the person has to sign in', () => {
    expect(isReportLoginError({ message: 'not_authenticated' })).toBe(true);
    expect(isReportLoginError({ message: 'permission denied', code: '42501' })).toBe(true);
    expect(isReportLoginError({ message: 'JWT expired' })).toBe(true);
  });

  it('is false for own_content, which shares its error code with a missing permission', () => {
    expect(isReportLoginError({ message: 'own_content', code: '42501' })).toBe(false);
  });

  it('is false for other errors', () => {
    expect(isReportLoginError({ message: 'report_rate_limited' })).toBe(false);
    expect(isReportLoginError({ message: 'already_reported' })).toBe(false);
    expect(isReportLoginError(null)).toBe(false);
  });
});

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
