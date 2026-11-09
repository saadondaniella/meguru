-- Ask the Seller, stage 2: seller answers (with edits) and reports.
--
-- Builds on stage 1 (20261109130000), which created listing_questions with the
-- answer columns. Same security model: the new table is LOCKED (RLS enabled,
-- no policies, no client privileges) and everything goes through SECURITY
-- DEFINER functions with an empty search_path and explicit EXECUTE grants.
--
-- Rules enforced here
--   * Only the owner of the listing can answer a question or edit the answer,
--     and only while the listing is PUBLISHED (not sold, not draft). Hidden
--     questions cannot be answered. Answers are 1-500 characters.
--   * One answer per question. The first answer sets answered_at; later edits
--     keep it and set answer_updated_at (only when the text really changes),
--     which the app shows as an "Edited" label.
--   * Any logged-in user can report a visible question or answer: spam,
--     offensive, misleading or other, with optional details (max 300). You
--     cannot report your own content, the same item twice, or more than 10
--     times in a rolling 24 hours.
--   * A report stores a snapshot of the reported text and is kept even if the
--     question is later deleted, so evidence cannot be erased by a seller
--     editing an answer or an asker deleting a question.
--   * Reports can never be read by clients (so reporters stay private). They
--     are reviewed manually in Supabase Studio.
--
-- Concurrency: answer_listing_question locks the listing FOR SHARE and then
-- re-checks its status, exactly like ask_listing_question, so an answer or
-- edit can never be saved after the seller marked the listing sold.
--
-- Error handling: functions raise a stable message key that the app maps to
-- friendly text.

-- ---------------------------------------------------------------------------
-- question_reports (locked)
-- ---------------------------------------------------------------------------

CREATE TABLE public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SET NULL, not CASCADE: the report and its snapshot outlive the question.
  question_id uuid
    REFERENCES public.listing_questions(id) ON DELETE SET NULL,

  reporter_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  target text NOT NULL,
  reason text NOT NULL,
  details text,

  -- The reported question or answer text, as it was when it was reported.
  reported_text text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT question_reports_target_check
    CHECK (target IN ('question', 'answer')),

  CONSTRAINT question_reports_reason_check
    CHECK (reason IN ('spam', 'offensive', 'misleading', 'other')),

  -- Stored trimmed, 1-300 characters, no control characters except newline.
  CONSTRAINT question_reports_details_check
    CHECK (
      details IS NULL
      OR (
        details = btrim(details, E' \t\r\n')
        AND char_length(details) BETWEEN 1 AND 300
        AND replace(details, E'\n', '') !~ '[[:cntrl:]]'
      )
    ),

  CONSTRAINT question_reports_reported_text_check
    CHECK (char_length(reported_text) >= 1),

  -- One report per user per item. (A NULL question_id, after the question was
  -- deleted, is never considered equal, which is fine: nothing can be
  -- reported on a deleted question.)
  CONSTRAINT question_reports_unique_per_reporter
    UNIQUE (question_id, target, reporter_id)
);

COMMENT ON TABLE public.question_reports IS
  'Reports of questions and answers, reviewed manually in Studio. Locked: written only by report_listing_content.';

-- The rolling 24 hour report limit.
CREATE INDEX question_reports_reporter_created_idx
ON public.question_reports (reporter_id, created_at DESC);

-- Studio review: all reports for one question.
CREATE INDEX question_reports_question_idx
ON public.question_reports (question_id);

-- Same lockdown as stage 1: new tables are granted to anon and authenticated
-- by default, so everything is revoked, and RLS has no policies.
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_reports FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- answer_listing_question: the listing owner answers or edits an answer
-- ---------------------------------------------------------------------------
-- A missing question, a hidden question and a question on someone else's
-- listing all raise the same 'not_answerable', so nothing is revealed to
-- people who do not own the listing. Only the owner learns that the listing is
-- no longer open ('listing_not_open', for sold and draft listings).

CREATE OR REPLACE FUNCTION public.answer_listing_question(
  p_question_id uuid,
  p_answer text
)
RETURNS TABLE (
  id uuid,
  answer text,
  answered_at timestamptz,
  answer_updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_text text := btrim(COALESCE(p_answer, ''), E' \t\r\n');
  v_listing_id uuid;
  v_seller_id uuid;
  v_status text;
  v_hidden boolean;
  v_new_answer text;
  v_answered_at timestamptz;
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Validate the text first: it needs no database access and no locks.
  IF char_length(v_text) < 1 OR char_length(v_text) > 500 THEN
    RAISE EXCEPTION 'invalid_length'
      USING ERRCODE = '22023';
  END IF;

  IF replace(v_text, E'\n', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_text'
      USING ERRCODE = '22023';
  END IF;

  -- Find the listing (unlocked read, only to know which row to lock).
  SELECT q.listing_id
  INTO v_listing_id
  FROM public.listing_questions AS q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_answerable'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the listing and read its owner and status under the lock.
  --
  -- FOR SHARE conflicts with the seller's UPDATE of the listing (a non-key
  -- UPDATE takes FOR NO KEY UPDATE), so marking the listing sold cannot slip in
  -- between this check and the update below, not even from a second tab:
  --   * if that UPDATE is already in flight, this SELECT waits for it and then
  --     sees status = 'sold', so the answer is refused;
  --   * if this transaction locks first, the UPDATE waits until we commit.
  -- FOR KEY SHARE would NOT work: it does not conflict with a non-key UPDATE.
  -- Deleting the listing also waits for this lock.
  SELECT l.seller_id, l.status
  INTO v_seller_id, v_status
  FROM public.listings AS l
  WHERE l.id = v_listing_id
  FOR SHARE;

  -- Ownership is checked before the status, so non-owners learn nothing about
  -- sold or draft listings.
  IF NOT FOUND OR v_seller_id <> v_uid THEN
    RAISE EXCEPTION 'not_answerable'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'listing_not_open'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock the question so two answers or edits (or a moderator hiding it) are
  -- serialized. The asker may have deleted it in the meantime; hidden
  -- questions cannot be answered.
  -- Lock order is always listing, then question.
  SELECT q.is_hidden
  INTO v_hidden
  FROM public.listing_questions AS q
  WHERE q.id = p_question_id
    AND q.listing_id = v_listing_id
  FOR UPDATE;

  IF NOT FOUND OR v_hidden THEN
    RAISE EXCEPTION 'not_answerable'
      USING ERRCODE = '42501';
  END IF;

  -- First answer: answered_at = now, answer_updated_at stays NULL.
  -- Edit: answered_at is kept; answer_updated_at is set only if the text
  -- really changed, so saving the same text does not add an "Edited" label.
  UPDATE public.listing_questions AS q
  SET
    answer = v_text,
    answered_at = COALESCE(q.answered_at, now()),
    answer_updated_at = CASE
      WHEN q.answer IS NULL THEN NULL
      WHEN q.answer = v_text THEN q.answer_updated_at
      ELSE now()
    END
  WHERE q.id = p_question_id
  RETURNING q.answer, q.answered_at, q.answer_updated_at
  INTO v_new_answer, v_answered_at, v_updated_at;

  RETURN QUERY SELECT p_question_id, v_new_answer, v_answered_at, v_updated_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- report_listing_content: report a visible question or answer
-- ---------------------------------------------------------------------------
-- Anything that is not visible to the public (unknown, hidden, on a draft
-- listing, or an answer that does not exist) raises the same 'not_reportable',
-- so nothing is revealed. Reports are allowed on sold listings.

CREATE OR REPLACE FUNCTION public.report_listing_content(
  p_question_id uuid,
  p_target text,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_details text := NULLIF(btrim(COALESCE(p_details, ''), E' \t\r\n'), '');
  v_listing_id uuid;
  v_asker_id uuid;
  v_question text;
  v_answer text;
  v_hidden boolean;
  v_seller_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_target IS NULL OR p_target NOT IN ('question', 'answer')
     OR p_reason IS NULL OR p_reason NOT IN ('spam', 'offensive', 'misleading', 'other') THEN
    RAISE EXCEPTION 'invalid_report'
      USING ERRCODE = '22023';
  END IF;

  IF v_details IS NOT NULL AND char_length(v_details) > 300 THEN
    RAISE EXCEPTION 'invalid_length'
      USING ERRCODE = '22023';
  END IF;

  IF v_details IS NOT NULL AND replace(v_details, E'\n', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_text'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize this user's reports so concurrent requests cannot slip past the
  -- duplicate check or the daily limit. Released at the end of the transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('report_listing_content:' || v_uid::text, 0)
  );

  -- Read the question under FOR SHARE, so a concurrent answer or edit cannot
  -- change the text between reading it and storing the snapshot. (The listing
  -- is read without a lock: reporting does not need it to stay unchanged.)
  SELECT q.listing_id, q.asker_id, q.question, q.answer, q.is_hidden
  INTO v_listing_id, v_asker_id, v_question, v_answer, v_hidden
  FROM public.listing_questions AS q
  WHERE q.id = p_question_id
  FOR SHARE;

  IF NOT FOUND OR v_hidden THEN
    RAISE EXCEPTION 'not_reportable'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT l.seller_id, l.status
  INTO v_seller_id, v_status
  FROM public.listings AS l
  WHERE l.id = v_listing_id;

  IF NOT FOUND OR v_status NOT IN ('published', 'sold') THEN
    RAISE EXCEPTION 'not_reportable'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_target = 'answer' AND v_answer IS NULL THEN
    RAISE EXCEPTION 'not_reportable'
      USING ERRCODE = 'P0002';
  END IF;

  -- You cannot report your own question or your own answer. A seller can
  -- still report a question on their listing, and an asker the answer.
  IF (p_target = 'question' AND v_asker_id = v_uid)
     OR (p_target = 'answer' AND v_seller_id = v_uid) THEN
    RAISE EXCEPTION 'own_content'
      USING ERRCODE = '42501';
  END IF;

  -- Duplicate check comes before the limit, so a double click is not shown
  -- as a rate limit error.
  IF EXISTS (
    SELECT 1
    FROM public.question_reports AS r
    WHERE r.question_id = p_question_id
      AND r.target = p_target
      AND r.reporter_id = v_uid
  ) THEN
    RAISE EXCEPTION 'already_reported'
      USING ERRCODE = 'P0001';
  END IF;

  -- At most 10 reports per rolling 24 hours, counted from the stored reports
  -- (clients cannot delete them, so there is no way to get quota back).
  IF (
    SELECT count(*)
    FROM public.question_reports AS r
    WHERE r.reporter_id = v_uid
      AND r.created_at > now() - interval '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'report_rate_limited'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.question_reports
    (question_id, reporter_id, target, reason, details, reported_text)
  VALUES (
    p_question_id,
    v_uid,
    p_target,
    p_reason,
    v_details,
    CASE p_target WHEN 'question' THEN v_question ELSE v_answer END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Functions in public are executable by anon and authenticated by default, so
-- everything is revoked first and then granted explicitly.

REVOKE ALL ON FUNCTION public.answer_listing_question(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.answer_listing_question(uuid, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.report_listing_content(uuid, text, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.report_listing_content(uuid, text, text, text)
TO authenticated;
