-- Ask the Seller, stage 1: public Q&A on listings.
--
-- Security model
--   * The tables are LOCKED: RLS is enabled, there are no policies, and all
--     client privileges are revoked. anon and authenticated can never read or
--     write them directly (so asker_id is never exposed by the API).
--   * Every read and write goes through SECURITY DEFINER functions with an
--     empty search_path. Each function does its own authorization.
--   * Rate limits live in the database: question_rate_log is append-only for
--     clients, so deleting a question does not give the user their quota back.
--
-- Rules enforced here
--   * Anyone can read questions on PUBLISHED or SOLD listings. Draft listings
--     and hidden questions are never returned. The asker is never returned.
--   * Only a logged-in user can ask, only on someone else's PUBLISHED listing.
--   * Question: 1-300 characters. Rate limits: 5 per hour, 20 per rolling
--     24 hours (both counted from question_rate_log, so hidden or deleted
--     questions still count), and at most 3 unanswered, NON-HIDDEN questions
--     per user per listing.
--   * The asker can delete their own question only while it is unanswered.
--
-- Concurrency: ask_listing_question re-checks the listing status under a
-- FOR SHARE row lock right before inserting, so a question can never be added
-- after the seller has marked the listing sold (see the function).
--
-- Answers (500 characters, editable by the listing owner) and reports are
-- added in the next stage. The answer columns exist now so the shape is final.
--
-- Error handling: functions raise a stable message key (for example
-- 'rate_limited_hour') that the app maps to friendly text.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.listing_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  listing_id uuid NOT NULL
    REFERENCES public.listings(id) ON DELETE CASCADE,

  asker_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One seller answer per question. The owner may edit it later.
  answer text,
  answered_at timestamptz,
  answer_updated_at timestamptz,

  -- Set manually in Supabase by a moderator. Hides the whole question and
  -- its answer from every public query.
  is_hidden boolean NOT NULL DEFAULT false,

  -- Stored trimmed, 1-300 characters, no control characters except newline.
  CONSTRAINT listing_questions_question_check
    CHECK (
      question = btrim(question, E' \t\r\n')
      AND char_length(question) BETWEEN 1 AND 300
      AND replace(question, E'\n', '') !~ '[[:cntrl:]]'
    ),

  -- Stored trimmed, 1-500 characters, no control characters except newline.
  CONSTRAINT listing_questions_answer_check
    CHECK (
      answer IS NULL
      OR (
        answer = btrim(answer, E' \t\r\n')
        AND char_length(answer) BETWEEN 1 AND 500
        AND replace(answer, E'\n', '') !~ '[[:cntrl:]]'
      )
    ),

  CONSTRAINT listing_questions_answered_pair_check
    CHECK ((answer IS NULL) = (answered_at IS NULL)),

  CONSTRAINT listing_questions_answer_updated_check
    CHECK (answer_updated_at IS NULL OR answer IS NOT NULL)
);

COMMENT ON TABLE public.listing_questions IS
  'Public Q&A on listings. Locked: access only through the SECURITY DEFINER functions.';

CREATE INDEX listing_questions_listing_created_idx
ON public.listing_questions (listing_id, created_at DESC, id DESC);

-- Counting unanswered questions per listing.
CREATE INDEX listing_questions_unanswered_idx
ON public.listing_questions (listing_id)
WHERE answer IS NULL AND NOT is_hidden;

-- The per-user, per-listing open question limit.
CREATE INDEX listing_questions_asker_listing_idx
ON public.listing_questions (asker_id, listing_id);

-- Append-only record of questions asked, used for rate limiting. Clients can
-- never delete from it, so ask-delete-ask cycles cannot evade the limits.
CREATE TABLE public.question_rate_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.question_rate_log IS
  'Rate limit log for asking questions. Locked: written only by ask_listing_question.';

CREATE INDEX question_rate_log_user_created_idx
ON public.question_rate_log (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Lock the tables
-- ---------------------------------------------------------------------------
-- New tables in public are granted to anon and authenticated by default, so
-- every client privilege is revoked explicitly. RLS is enabled with no
-- policies as a second layer: even if a privilege were granted by mistake,
-- no row would be visible or writable. (The table owner and the Supabase
-- service role bypass RLS, which is how moderators work in Studio.)

ALTER TABLE public.listing_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_rate_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.listing_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.question_rate_log FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_listing_questions: public read, newest first, paginated
-- ---------------------------------------------------------------------------
-- Returns only visible questions: the listing must be published or sold and
-- the question must not be hidden. asker_id is never returned; is_own tells
-- the caller which questions are theirs. total_count is the number of visible
-- questions on the listing, for the "Show more" button.

CREATE OR REPLACE FUNCTION public.get_listing_questions(
  p_listing_id uuid,
  p_limit integer DEFAULT 5,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  question text,
  created_at timestamptz,
  answer text,
  answered_at timestamptz,
  answer_updated_at timestamptz,
  is_own boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    q.id,
    q.question,
    q.created_at,
    q.answer,
    q.answered_at,
    q.answer_updated_at,
    COALESCE(q.asker_id = (SELECT auth.uid()), false) AS is_own,
    COUNT(*) OVER () AS total_count
  FROM public.listing_questions AS q
  JOIN public.listings AS l ON l.id = q.listing_id
  WHERE q.listing_id = p_listing_id
    AND NOT q.is_hidden
    AND l.status IN ('published', 'sold')
  ORDER BY q.created_at DESC, q.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- ask_listing_question: logged-in users ask on other sellers' published listings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ask_listing_question(
  p_listing_id uuid,
  p_question text
)
RETURNS TABLE (
  id uuid,
  question text,
  created_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_text text := btrim(COALESCE(p_question, ''), E' \t\r\n');
  v_status text;
  v_seller_id uuid;
  v_new_id uuid;
  v_new_created_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Cheap early check, without locking, so obvious mistakes fail fast and
  -- never take a lock. Only published listings accept questions. A missing
  -- listing and a draft give the same error, so drafts are not revealed.
  -- This read can be stale; the status is re-checked under a lock below.
  SELECT l.status, l.seller_id
  INTO v_status, v_seller_id
  FROM public.listings AS l
  WHERE l.id = p_listing_id;

  IF NOT FOUND OR v_status <> 'published' THEN
    RAISE EXCEPTION 'listing_not_open'
      USING ERRCODE = 'P0002';
  END IF;

  -- Sellers cannot ask questions on their own listings.
  IF v_seller_id = v_uid THEN
    RAISE EXCEPTION 'own_listing'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_text) < 1 OR char_length(v_text) > 300 THEN
    RAISE EXCEPTION 'invalid_length'
      USING ERRCODE = '22023';
  END IF;

  IF replace(v_text, E'\n', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_text'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize this user's asks so concurrent requests cannot slip past the
  -- limits. The lock is released automatically at the end of the transaction.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ask_listing_question:' || v_uid::text, 0)
  );

  -- Keep the log small: drop this user's entries older than two days.
  DELETE FROM public.question_rate_log AS r
  WHERE r.user_id = v_uid
    AND r.created_at < now() - interval '2 days';

  IF (
    SELECT count(*)
    FROM public.question_rate_log AS r
    WHERE r.user_id = v_uid
      AND r.created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'rate_limited_hour'
      USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*)
    FROM public.question_rate_log AS r
    WHERE r.user_id = v_uid
      AND r.created_at > now() - interval '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited_day'
      USING ERRCODE = 'P0001';
  END IF;

  -- At most 3 open (unanswered, non-hidden) questions per user per listing.
  -- Deleting or hiding a question frees a slot here, but never in the rate
  -- log above, so the hourly and daily limits still count it.
  IF (
    SELECT count(*)
    FROM public.listing_questions AS q
    WHERE q.listing_id = p_listing_id
      AND q.asker_id = v_uid
      AND q.answer IS NULL
      AND NOT q.is_hidden
  ) >= 3 THEN
    RAISE EXCEPTION 'too_many_unanswered'
      USING ERRCODE = 'P0001';
  END IF;

  -- Re-check the listing under a row lock, immediately before inserting.
  --
  -- The earlier read was not locked, so the seller could mark the listing
  -- sold (or delete it) after it. FOR SHARE conflicts with the seller's
  -- UPDATE of the listing (a non-key UPDATE takes FOR NO KEY UPDATE), so:
  --   * if that UPDATE is already in flight, this SELECT waits for it to
  --     finish and then sees the new status, and the question is refused;
  --   * if this transaction gets the lock first, the seller's UPDATE waits
  --     until the question is committed, so it can never slip in between.
  -- FOR KEY SHARE would NOT work: it does not conflict with a non-key UPDATE.
  --
  -- Taken last, so it is held only for the INSERT and not while waiting for
  -- the advisory lock or running the limit checks. FOR SHARE locks do not
  -- block each other, so many people can ask on one listing at once.
  -- Lock order is always advisory lock, then listing row, so no deadlock.
  SELECT l.status
  INTO v_status
  FROM public.listings AS l
  WHERE l.id = p_listing_id
  FOR SHARE;

  IF NOT FOUND OR v_status <> 'published' THEN
    RAISE EXCEPTION 'listing_not_open'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.listing_questions AS q (listing_id, asker_id, question)
  VALUES (p_listing_id, v_uid, v_text)
  RETURNING q.id, q.created_at
  INTO v_new_id, v_new_created_at;

  INSERT INTO public.question_rate_log (user_id)
  VALUES (v_uid);

  RETURN QUERY SELECT v_new_id, v_text, v_new_created_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- delete_listing_question: the asker deletes their own unanswered question
-- ---------------------------------------------------------------------------
-- A missing question, someone else's question and an answered question all
-- give the same error, so nothing is revealed. Sellers cannot delete
-- questions. Deleting is allowed on sold listings: removing your own content
-- is not new activity.

CREATE OR REPLACE FUNCTION public.delete_listing_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.listing_questions AS q
  WHERE q.id = p_question_id
    AND q.asker_id = v_uid
    AND q.answer IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_deletable'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Functions in public are executable by anon and authenticated by default, so
-- everything is revoked first and then granted explicitly.

REVOKE ALL ON FUNCTION public.get_listing_questions(uuid, integer, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_listing_questions(uuid, integer, integer)
TO anon, authenticated;

REVOKE ALL ON FUNCTION public.ask_listing_question(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ask_listing_question(uuid, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.delete_listing_question(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_listing_question(uuid)
TO authenticated;
