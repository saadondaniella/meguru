-- pgTAP security tests for Ask the Seller, stage 1.
-- Covers: locked tables, function privileges, visibility rules, asking rules,
-- rate limits (including delete-and-repost evasion) and deleting.
--
-- Run against the LOCAL stack only:  npx supabase test db
-- Everything happens in one transaction that is rolled back at the end.
--
-- no_plan() is used so a miscounted plan cannot fail the run; after the first
-- green run it can be replaced with plan(<number reported by finish()>).

BEGIN;

SELECT plan(90);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the table owner)
-- ---------------------------------------------------------------------------
-- Users:     1 seller, 2 buyer B, 3 buyer C, 4 evasion test, 5 per-listing
--            limit test, 6 day-limit test, 7 hour-limit test, 8 log-purge test,
--            9 hidden-questions test
-- Listings:  ...01 published (read tests), ...02 published (ask tests),
--            ...03 sold, ...04 draft, ...05 published (cascade test)

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'seller@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'buyer-b@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'buyer-c@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'user-4@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'user-5@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'user-6@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'user-7@test.local'),
  ('00000000-0000-4000-8000-000000000008', 'user-8@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'user-9@test.local');

INSERT INTO public.listings (id, seller_id, title, price, category, condition, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Published A', 100, 'exclusive', 'good', 'published'),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Published B', 100, 'exclusive', 'good', 'published'),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Sold', 100, 'exclusive', 'good', 'sold'),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Draft', 100, 'exclusive', 'good', 'draft'),
  ('a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Cascade', 100, 'exclusive', 'good', 'published');

INSERT INTO public.listing_questions
  (id, listing_id, asker_id, question, created_at, answer, answered_at, is_hidden)
VALUES
  -- Published listing 01: q1 answered (older), q2 unanswered (newer), qh hidden.
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Is it true to size?', now() - interval '3 days', 'Yes.', now() - interval '2 days', false),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Is shipping included?', now() - interval '1 day', NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003',
   'Hidden by a moderator', now() - interval '12 hours', NULL, NULL, true),
  -- Sold listing 03: one answered, one unanswered.
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'Sold: answered question', now() - interval '5 days', 'Answer.', now() - interval '4 days', false),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'Sold: unanswered question', now() - interval '4 days', NULL, NULL, false),
  -- Draft listing 04.
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Question on a draft', now() - interval '1 day', NULL, NULL, false),
  -- Cascade listing 05.
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003',
   'Question that will cascade', now() - interval '1 day', NULL, NULL, false);

-- Rate limit fixtures.
-- User 6: 20 entries between 3 and 4 hours ago (hour count 0, day count 20).
INSERT INTO public.question_rate_log (user_id, created_at)
SELECT '00000000-0000-4000-8000-000000000006', now() - interval '3 hours' - (g || ' minutes')::interval
FROM generate_series(1, 20) AS g;

-- User 7: 5 entries in the last few minutes (hour count 5).
INSERT INTO public.question_rate_log (user_id, created_at)
SELECT '00000000-0000-4000-8000-000000000007', now() - (g || ' minutes')::interval
FROM generate_series(1, 5) AS g;

-- User 8: 30 entries from three days ago (should be purged on the next ask).
INSERT INTO public.question_rate_log (user_id, created_at)
SELECT '00000000-0000-4000-8000-000000000008', now() - interval '3 days' - (g || ' minutes')::interval
FROM generate_series(1, 30) AS g;

-- ---------------------------------------------------------------------------
-- 1. Structure and locked tables (as the table owner)
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'listing_questions', 'listing_questions exists');
SELECT has_table('public', 'question_rate_log', 'question_rate_log exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.listing_questions'::regclass),
  'RLS is enabled on listing_questions'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.question_rate_log'::regclass),
  'RLS is enabled on question_rate_log'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('listing_questions', 'question_rate_log')),
  0,
  'There are no RLS policies: the tables are fully locked for clients'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.listing_questions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anon has no privileges on listing_questions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.listing_questions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated has no privileges on listing_questions'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.question_rate_log', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anon has no privileges on question_rate_log'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.question_rate_log', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated has no privileges on question_rate_log'
);

SELECT ok(
  has_function_privilege('anon', 'public.get_listing_questions(uuid,integer,integer)', 'EXECUTE'),
  'anon can read questions'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_listing_questions(uuid,integer,integer)', 'EXECUTE'),
  'authenticated can read questions'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.ask_listing_question(uuid,text)', 'EXECUTE'),
  'anon cannot ask questions'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.ask_listing_question(uuid,text)', 'EXECUTE'),
  'authenticated can ask questions'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_listing_question(uuid)', 'EXECUTE'),
  'anon cannot delete questions'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.delete_listing_question(uuid)', 'EXECUTE'),
  'authenticated can delete questions'
);

SELECT ok(
  (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%')
   FROM pg_proc AS p
   WHERE p.oid IN (
     'public.get_listing_questions(uuid,integer,integer)'::regprocedure,
     'public.ask_listing_question(uuid,text)'::regprocedure,
     'public.delete_listing_question(uuid)'::regprocedure
   )),
  'All three functions are SECURITY DEFINER with a fixed search_path'
);

SELECT ok(
  (SELECT NOT ('asker_id' = ANY (p.proargnames))
   FROM pg_proc AS p
   WHERE p.oid = 'public.get_listing_questions(uuid,integer,integer)'::regprocedure),
  'get_listing_questions does not return asker_id'
);

-- Regression guard for the sold-listing race. Concurrency cannot be exercised
-- inside one transaction, so this only checks that the status is re-read under
-- a FOR SHARE row lock (the weaker FOR KEY SHARE would not conflict with the
-- seller's UPDATE). The real behavior is checked by the two-session manual test.
SELECT ok(
  (SELECT p.prosrc ~ 'FOR SHARE;'
   FROM pg_proc AS p
   WHERE p.oid = 'public.ask_listing_question(uuid,text)'::regprocedure),
  'ask_listing_question re-checks the listing status under FOR SHARE'
);

-- Table constraints (as the table owner).
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', repeat('x', 301))$$,
  '23514',
  NULL,
  'A 301 character question violates the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', ' padded ')$$,
  '23514',
  NULL,
  'An untrimmed question violates the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question, answer)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Q', 'A without a timestamp')$$,
  '23514',
  NULL,
  'An answer without answered_at violates the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question, answer, answered_at)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Q', repeat('x', 501), now())$$,
  '23514',
  NULL,
  'A 501 character answer violates the table check'
);

-- ---------------------------------------------------------------------------
-- 2. Direct table access is denied to clients
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.listing_questions$$,
  '42501',
  'permission denied for table listing_questions',
  'anon cannot read listing_questions directly'
);
SELECT throws_ok(
  $$SELECT * FROM public.question_rate_log$$,
  '42501',
  'permission denied for table question_rate_log',
  'anon cannot read question_rate_log directly'
);
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Direct insert')$$,
  '42501',
  'permission denied for table listing_questions',
  'anon cannot insert into listing_questions directly'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.listing_questions$$,
  '42501',
  'permission denied for table listing_questions',
  'authenticated cannot read listing_questions directly'
);
SELECT throws_ok(
  $$INSERT INTO public.listing_questions (listing_id, asker_id, question)
    VALUES ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Direct insert')$$,
  '42501',
  'permission denied for table listing_questions',
  'authenticated cannot insert into listing_questions directly'
);
SELECT throws_ok(
  $$UPDATE public.listing_questions SET question = 'Edited'$$,
  '42501',
  'permission denied for table listing_questions',
  'authenticated cannot update listing_questions directly'
);
SELECT throws_ok(
  $$DELETE FROM public.listing_questions$$,
  '42501',
  'permission denied for table listing_questions',
  'authenticated cannot delete from listing_questions directly'
);
SELECT throws_ok(
  $$SELECT * FROM public.question_rate_log$$,
  '42501',
  'permission denied for table question_rate_log',
  'authenticated cannot read question_rate_log directly'
);
SELECT throws_ok(
  $$DELETE FROM public.question_rate_log$$,
  '42501',
  'permission denied for table question_rate_log',
  'authenticated cannot clear question_rate_log'
);

-- ---------------------------------------------------------------------------
-- 3. Reading: visibility rules (as anon)
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001')),
  2,
  'Anon sees the 2 visible questions on a published listing (hidden one excluded)'
);
SELECT is(
  (SELECT total_count::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001') LIMIT 1),
  2,
  'total_count reflects visible questions only'
);
SELECT is(
  (SELECT id FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001', 5, 0) LIMIT 1),
  'b0000000-0000-4000-8000-000000000002'::uuid,
  'The newest question comes first'
);
SELECT is(
  (SELECT id FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001', 1, 1)),
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'Pagination: limit 1, offset 1 returns the older question'
);
SELECT is(
  (SELECT total_count::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001', 1, 1)),
  2,
  'Pagination keeps the full total_count'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001', 5, -3)),
  2,
  'A negative offset is treated as 0'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001')
   WHERE is_own),
  0,
  'Anon never owns a question'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000003')),
  2,
  'Q&A on a sold listing stays readable'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000004')),
  0,
  'Q&A on a draft listing is not exposed'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('ffffffff-ffff-4fff-8fff-ffffffffffff')),
  0,
  'An unknown listing returns nothing'
);

-- is_own for logged-in users.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001') WHERE is_own),
  2,
  'The asker sees their own 2 questions flagged as is_own'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001') WHERE is_own),
  0,
  'Another user does not own those questions (their hidden one stays hidden)'
);

-- ---------------------------------------------------------------------------
-- 4. Asking
-- ---------------------------------------------------------------------------

-- Anonymous visitors cannot ask.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hello?')$$,
  '42501',
  NULL,
  'Anon cannot ask a question'
);

-- Authenticated token without a user id.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hello?')$$,
  '28000',
  'not_authenticated',
  'A request without a user id is rejected'
);

-- The seller cannot ask on their own listing.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'My own item?')$$,
  '42501',
  'own_listing',
  'A seller cannot ask on their own listing'
);

-- Buyer B asks.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000003', 'Still available?')$$,
  'P0002',
  'listing_not_open',
  'Cannot ask on a sold listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000004', 'Is this ready?')$$,
  'P0002',
  'listing_not_open',
  'Cannot ask on a draft listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Anyone there?')$$,
  'P0002',
  'listing_not_open',
  'Cannot ask on an unknown listing (same error as a draft)'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', '   ')$$,
  '22023',
  'invalid_length',
  'A blank question is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', repeat('x', 301))$$,
  '22023',
  'invalid_length',
  'A 301 character question is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', E'bad\x01text')$$,
  '22023',
  'invalid_text',
  'Control characters are rejected'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', repeat('x', 300))$$,
  'A 300 character question is accepted'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', E'  Does it\nfit?  ')$$,
  'A question with a newline and surrounding spaces is accepted'
);

-- Check what was stored (as the table owner).
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE listing_id = 'a0000000-0000-4000-8000-000000000002'
     AND asker_id = '00000000-0000-4000-8000-000000000002'),
  2,
  'Two questions were stored for buyer B'
);
SELECT is(
  (SELECT question FROM public.listing_questions
   WHERE listing_id = 'a0000000-0000-4000-8000-000000000002'
     AND question LIKE '%fit?%'),
  E'Does it\nfit?',
  'The question is stored trimmed, with its newline'
);
SELECT is(
  (SELECT count(*)::int FROM public.question_rate_log
   WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  2,
  'Each accepted question was logged for rate limiting'
);

-- Per-listing limit: 3 open questions per user per listing (user 5).
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'First?')$$,
  'Open question 1 of 3'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Second?')$$,
  'Open question 2 of 3'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Third?')$$,
  'Open question 3 of 3'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Fourth?')$$,
  'P0001',
  'too_many_unanswered',
  'A 4th unanswered question on the same listing is rejected'
);

-- Deleting one frees a slot on this listing.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.delete_listing_question(
      (SELECT q.id FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000002', 50, 0) AS q
       WHERE q.is_own AND q.question = 'Third?'))$$,
  'The asker deletes one of their open questions'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Third again?')$$,
  'A slot is free again on that listing after deleting'
);

-- Hourly limit: user 7 has 5 entries in the last hour.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'One too many?')$$,
  'P0001',
  'rate_limited_hour',
  'The 6th question within an hour is rejected'
);

-- Daily limit: user 6 has 20 entries in the last 24 hours, none in the last hour.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Day limit?')$$,
  'P0001',
  'rate_limited_day',
  'The 21st question within 24 hours is rejected'
);

-- Evasion: asking and deleting five times must still hit the hourly limit (user 4).
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $evade$
    DO $do$
    DECLARE
      r record;
    BEGIN
      FOR i IN 1..5 LOOP
        SELECT * INTO r
        FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Evade ' || i);

        PERFORM public.delete_listing_question(r.id);
      END LOOP;
    END
    $do$
  $evade$,
  'Five ask-and-delete cycles are accepted'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Sixth after deleting?')$$,
  'P0001',
  'rate_limited_hour',
  'Deleting questions does not give the hourly quota back'
);

-- Purge: user 8 only has old log entries, so asking works and purges them.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'After a quiet spell?')$$,
  'Old log entries do not count against the limits'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.question_rate_log
   WHERE user_id = '00000000-0000-4000-8000-000000000008'),
  1,
  'Log entries older than two days were purged, leaving only the new one'
);
SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE asker_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'The evasion test left no questions behind'
);
SELECT is(
  (SELECT count(*)::int FROM public.question_rate_log
   WHERE user_id = '00000000-0000-4000-8000-000000000004'),
  5,
  'The evasion test left 5 log entries (the log is append-only for users)'
);

-- Hidden questions (user 9). A moderator hides questions in Studio (here: as the
-- table owner). Hidden questions free their per-listing slot, but still count
-- toward the hourly and daily limits through question_rate_log.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 1')$$,
  'User 9: open question 1 of 3'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 2')$$,
  'User 9: open question 2 of 3'
);
SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 3')$$,
  'User 9: open question 3 of 3'
);
SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 4')$$,
  'P0001',
  'too_many_unanswered',
  'User 9: a 4th open question is rejected while none are hidden'
);

-- A moderator hides one question.
RESET ROLE;
UPDATE public.listing_questions SET is_hidden = true
WHERE asker_id = '00000000-0000-4000-8000-000000000009' AND question = 'Hide 1';

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 4')$$,
  'A hidden question does not count toward the 3 unanswered limit'
);

-- Hide another, then use the 5th hourly question.
RESET ROLE;
UPDATE public.listing_questions SET is_hidden = true
WHERE asker_id = '00000000-0000-4000-8000-000000000009' AND question = 'Hide 2';

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 5')$$,
  'A second hidden question frees another slot (5th question this hour)'
);

-- Hide a third. Only 2 visible open questions remain, so the per-listing limit
-- is not what blocks the next one: the hourly limit must, because hidden
-- questions still count in question_rate_log.
RESET ROLE;
UPDATE public.listing_questions SET is_hidden = true
WHERE asker_id = '00000000-0000-4000-8000-000000000009' AND question = 'Hide 3';

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000002', 'Hide 6')$$,
  'P0001',
  'rate_limited_hour',
  'Hiding questions does not restore the hourly quota'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.question_rate_log
   WHERE user_id = '00000000-0000-4000-8000-000000000009'),
  5,
  'Hidden questions still count in question_rate_log (5 entries for 5 questions)'
);
SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE asker_id = '00000000-0000-4000-8000-000000000009'
     AND answer IS NULL AND NOT is_hidden),
  2,
  'Only 2 visible open questions remained, so the per-listing limit was not the blocker'
);

-- ---------------------------------------------------------------------------
-- 5. Deleting
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000002')$$,
  '42501',
  NULL,
  'Anon cannot delete questions'
);

-- Another buyer cannot delete B's question.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000002')$$,
  '42501',
  'not_deletable',
  'Another user cannot delete someone else''s question'
);

-- The seller cannot delete questions on their own listing.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000002')$$,
  '42501',
  'not_deletable',
  'The seller cannot delete a question'
);

-- Buyer B.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000001')$$,
  '42501',
  'not_deletable',
  'The asker cannot delete an answered question'
);
SELECT throws_ok(
  $$SELECT public.delete_listing_question('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  '42501',
  'not_deletable',
  'Deleting an unknown question gives the same error'
);
SELECT lives_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000002')$$,
  'The asker can delete their own unanswered question'
);
SELECT lives_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000005')$$,
  'The asker can delete an unanswered question even on a sold listing'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE id IN ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005')),
  0,
  'Both deleted questions are gone'
);
SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  1,
  'The answered question was kept'
);

-- ---------------------------------------------------------------------------
-- 6. Cascades
-- ---------------------------------------------------------------------------

DELETE FROM public.listings WHERE id = 'a0000000-0000-4000-8000-000000000005';

SELECT is(
  (SELECT count(*)::int FROM public.listing_questions
   WHERE id = 'b0000000-0000-4000-8000-000000000007'),
  0,
  'Deleting a listing deletes its questions'
);

SELECT * FROM finish();

ROLLBACK;
