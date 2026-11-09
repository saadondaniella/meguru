-- pgTAP security tests for Ask the Seller, stage 2: answers and reports.
-- Covers: the locked question_reports table, function privileges and locking,
-- answering and editing (ownership, sold/draft/hidden, timestamps), reporting
-- (permissions, duplicates, snapshots, rolling 24 hour limit) and cascades.
--
-- Run against the LOCAL stack only:  npx supabase test db
-- Everything happens in one transaction that is rolled back at the end.
--
-- Concurrency (the sold-listing race) cannot be exercised inside one
-- transaction. It is checked by a source guard here and by a manual
-- two-session test.

BEGIN;

SELECT plan(91);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the table owner)
-- ---------------------------------------------------------------------------
-- Users:     1 seller S, 2 asker A, 3 reporter R1, 4 reporter R2,
--            5 another seller O, 6 report limit reached (10 in 24h),
--            7 old reports only (10, all older than 24h),
--            8 asker with 3 open questions, 9 report limit boundary (9 in 24h)
-- Listings:  ...01 published (S), ...03 sold (S), ...04 draft (S),
--            ...05 published (O), ...06 published (S, cascade test)
-- Questions: see the INSERT below.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'seller@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'asker@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'reporter-1@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'reporter-2@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'other-seller@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'user-6@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'user-7@test.local'),
  ('00000000-0000-4000-8000-000000000008', 'user-8@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'user-9@test.local');

INSERT INTO public.listings (id, seller_id, title, price, category, condition, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Published', 100, 'exclusive', 'good', 'published'),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Sold', 100, 'exclusive', 'good', 'sold'),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Draft', 100, 'exclusive', 'good', 'draft'),
  ('a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'Other seller', 100, 'exclusive', 'good', 'published'),
  ('a0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'Cascade', 100, 'exclusive', 'good', 'published');

INSERT INTO public.listing_questions
  (id, listing_id, asker_id, question, answer, answered_at, answer_updated_at, is_hidden)
VALUES
  -- Published listing 01 (asker A unless noted)
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Is it available?', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'What size is it?', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Is it true to size?', 'Original answer.', now() - interval '2 days', NULL, false),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'A hidden question', NULL, NULL, NULL, true),
  ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Any marks on it?', 'Evidence answer.', now() - interval '2 days', NULL, false),
  ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Will be deleted', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Does it have pockets?', 'Same text.', now() - interval '3 days', now() - interval '1 day', false),
  -- Published listing 01, asker 8 with three open questions
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008',
   'Slot 1', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008',
   'Slot 2', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000008',
   'Slot 3', NULL, NULL, NULL, false),
  -- Sold listing 03
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'Sold: unanswered', NULL, NULL, NULL, false),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'Sold: answered', 'Sold answer.', now() - interval '3 days', NULL, false),
  -- Draft listing 04
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
   'Question on a draft', NULL, NULL, NULL, false),
  -- Other seller's listing 05
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'Question for another seller', NULL, NULL, NULL, false),
  -- Cascade listing 06
  ('b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002',
   'Cascade question', NULL, NULL, NULL, false);

-- Report limit fixtures (no question: the question_id of a deleted question is NULL).
-- User 6: 10 reports within the last 24 hours.
INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text, created_at)
SELECT NULL, '00000000-0000-4000-8000-000000000006', 'question', 'spam', 'old report',
       now() - make_interval(hours => g)
FROM generate_series(1, 10) AS g;

-- User 7: 10 reports, all older than 24 hours.
INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text, created_at)
SELECT NULL, '00000000-0000-4000-8000-000000000007', 'question', 'spam', 'old report',
       now() - interval '25 hours' - make_interval(mins => g)
FROM generate_series(1, 10) AS g;

-- User 9: 9 reports within the last 24 hours (one short of the limit).
INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text, created_at)
SELECT NULL, '00000000-0000-4000-8000-000000000009', 'question', 'spam', 'old report',
       now() - make_interval(hours => g)
FROM generate_series(1, 9) AS g;

-- ---------------------------------------------------------------------------
-- 1. Structure, locking and constraints (as the table owner)
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'question_reports', 'question_reports exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.question_reports'::regclass),
  'RLS is enabled on question_reports'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'question_reports'),
  0,
  'There are no RLS policies: question_reports is fully locked for clients'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.question_reports', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anon has no privileges on question_reports'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.question_reports', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated has no privileges on question_reports'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.answer_listing_question(uuid,text)', 'EXECUTE'),
  'anon cannot answer questions'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.answer_listing_question(uuid,text)', 'EXECUTE'),
  'authenticated can call answer_listing_question'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.report_listing_content(uuid,text,text,text)', 'EXECUTE'),
  'anon cannot report content'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.report_listing_content(uuid,text,text,text)', 'EXECUTE'),
  'authenticated can call report_listing_content'
);

SELECT ok(
  (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=%')
   FROM pg_proc AS p
   WHERE p.oid IN (
     'public.answer_listing_question(uuid,text)'::regprocedure,
     'public.report_listing_content(uuid,text,text,text)'::regprocedure
   )),
  'Both functions are SECURITY DEFINER with a fixed search_path'
);

-- Regression guards for the locking (real behavior: manual two-session test).
SELECT ok(
  (SELECT p.prosrc ~ 'FOR SHARE;'
   FROM pg_proc AS p
   WHERE p.oid = 'public.answer_listing_question(uuid,text)'::regprocedure),
  'answer_listing_question re-checks the listing status under FOR SHARE'
);
SELECT ok(
  (SELECT p.prosrc ~ 'FOR UPDATE;'
   FROM pg_proc AS p
   WHERE p.oid = 'public.answer_listing_question(uuid,text)'::regprocedure),
  'answer_listing_question locks the question row FOR UPDATE'
);
SELECT ok(
  (SELECT p.prosrc ~ 'FOR SHARE;'
   FROM pg_proc AS p
   WHERE p.oid = 'public.report_listing_content(uuid,text,text,text)'::regprocedure),
  'report_listing_content reads the question under FOR SHARE'
);

-- Table constraints.
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'comment', 'spam', 'x')$$,
  '23514',
  NULL,
  'An unknown target violates the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'question', 'rude', 'x')$$,
  '23514',
  NULL,
  'An unknown reason violates the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, details, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'question', 'spam', repeat('x', 301), 'x')$$,
  '23514',
  NULL,
  '301 characters of details violate the table check'
);
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'question', 'spam', '')$$,
  '23514',
  NULL,
  'An empty snapshot violates the table check'
);
SELECT lives_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'question', 'spam', 'What size is it?')$$,
  'A valid report row can be inserted by the table owner'
);
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'question', 'other', 'What size is it?')$$,
  '23505',
  NULL,
  'The same reporter cannot report the same item twice (unique constraint)'
);

-- ---------------------------------------------------------------------------
-- 2. Direct table access is denied to clients
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.question_reports$$,
  '42501',
  'permission denied for table question_reports',
  'anon cannot read question_reports'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.question_reports$$,
  '42501',
  'permission denied for table question_reports',
  'authenticated cannot read question_reports (reporters stay private)'
);
SELECT throws_ok(
  $$INSERT INTO public.question_reports (question_id, reporter_id, target, reason, reported_text)
    VALUES ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'question', 'spam', 'x')$$,
  '42501',
  'permission denied for table question_reports',
  'authenticated cannot insert into question_reports directly'
);
SELECT throws_ok(
  $$DELETE FROM public.question_reports$$,
  '42501',
  'permission denied for table question_reports',
  'authenticated cannot delete reports'
);

-- ---------------------------------------------------------------------------
-- 3. Answering and editing
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', 'Yes.')$$,
  '42501',
  NULL,
  'Anon cannot answer'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', 'Yes.')$$,
  '28000',
  'not_authenticated',
  'A request without a user id is rejected'
);

-- The asker is not the listing owner.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', 'Answering myself')$$,
  '42501',
  'not_answerable',
  'The asker cannot answer their own question'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000004', 'Answering on a sold listing')$$,
  '42501',
  'not_answerable',
  'A non-owner gets the generic error on a sold listing (nothing is revealed)'
);

-- Another seller.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', 'Not my listing')$$,
  '42501',
  'not_answerable',
  'Another seller cannot answer on someone else''s listing'
);

-- The listing owner.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Hello')$$,
  '42501',
  'not_answerable',
  'An unknown question gives the generic error'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000008', 'Wrong listing')$$,
  '42501',
  'not_answerable',
  'The seller cannot answer a question on another seller''s listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000007', 'Hidden')$$,
  '42501',
  'not_answerable',
  'A hidden question cannot be answered'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000004', 'Too late')$$,
  'P0002',
  'listing_not_open',
  'No new answer on a sold listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000005', 'Edited after sale')$$,
  'P0002',
  'listing_not_open',
  'No answer edit on a sold listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000006', 'On a draft')$$,
  'P0002',
  'listing_not_open',
  'No answer on a draft listing'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', '   ')$$,
  '22023',
  'invalid_length',
  'A blank answer is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', repeat('x', 501))$$,
  '22023',
  'invalid_length',
  'A 501 character answer is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', E'bad\x01text')$$,
  '22023',
  'invalid_text',
  'Control characters in an answer are rejected'
);

-- First answer: trimmed, answered_at set, no "edited" timestamp.
SELECT is(
  (SELECT a.answer FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', '  Thanks.  ') AS a),
  'Thanks.',
  'The first answer is stored trimmed and returned'
);

RESET ROLE;

SELECT ok(
  (SELECT answered_at IS NOT NULL AND answer_updated_at IS NULL
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  'A first answer sets answered_at and leaves answer_updated_at empty (no Edited label)'
);

-- Edit: answer changes, answered_at is kept, answer_updated_at is set.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000001', 'Thanks again.')$$,
  'The owner can edit the first answer'
);
SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000003', 'Edited answer.')$$,
  'The owner can edit an older answer'
);

RESET ROLE;

SELECT is(
  (SELECT answer FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  'Thanks again.',
  'The edited answer was stored'
);
SELECT ok(
  (SELECT answer_updated_at IS NOT NULL
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000001'),
  'An edit sets answer_updated_at'
);
SELECT ok(
  (SELECT answered_at = now() - interval '2 days'
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000003'),
  'An edit keeps the original answered_at'
);
SELECT ok(
  (SELECT answer = 'Edited answer.' AND answer_updated_at = now()
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000003'),
  'The edit changed the answer and stamped answer_updated_at'
);

-- The public read function exposes the edit timestamp (for the Edited label).
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT ok(
  (SELECT g.answer_updated_at IS NOT NULL AND g.answer = 'Edited answer.'
   FROM public.get_listing_questions('a0000000-0000-4000-8000-000000000001', 50, 0) AS g
   WHERE g.id = 'b0000000-0000-4000-8000-000000000003'),
  'The public read shows the edited answer and its edit timestamp'
);

-- Saving the same text again is not an edit.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000016', 'Same text.')$$,
  'Saving the same answer text succeeds'
);

RESET ROLE;

SELECT ok(
  (SELECT answer_updated_at = now() - interval '1 day'
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000016'),
  'Saving identical text does not change answer_updated_at'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000016', 'Changed text.')$$,
  'Changing the answer text succeeds'
);

RESET ROLE;

SELECT ok(
  (SELECT answer_updated_at = now()
   FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000016'),
  'Changing the text moves answer_updated_at to now'
);

-- A 500 character answer is accepted.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000002', repeat('x', 500))$$,
  'A 500 character answer is accepted'
);

-- Answering frees one of the asker's 3 open question slots (user 8).
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000001', 'Slot 4')$$,
  'P0001',
  'too_many_unanswered',
  'User 8 has 3 open questions and cannot ask a 4th'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000010', 'Answered.')$$,
  'The seller answers one of user 8''s questions'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.ask_listing_question('a0000000-0000-4000-8000-000000000001', 'Slot 4')$$,
  'An answered question frees a slot for user 8'
);

-- ---------------------------------------------------------------------------
-- 4. Reporting
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam')$$,
  '42501',
  NULL,
  'Anon cannot report'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam')$$,
  '28000',
  'not_authenticated',
  'A report without a user id is rejected'
);

-- Reporter 1.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'comment', 'spam')$$,
  '22023',
  'invalid_report',
  'An unknown target is rejected'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'rude')$$,
  '22023',
  'invalid_report',
  'An unknown reason is rejected'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam', repeat('x', 301))$$,
  '22023',
  'invalid_length',
  'Details longer than 300 characters are rejected'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam', E'bad\x01text')$$,
  '22023',
  'invalid_text',
  'Control characters in details are rejected'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('ffffffff-ffff-4fff-8fff-ffffffffffff', 'question', 'spam')$$,
  'P0002',
  'not_reportable',
  'An unknown question is not reportable'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000007', 'question', 'spam')$$,
  'P0002',
  'not_reportable',
  'A hidden question is not reportable'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000006', 'question', 'spam')$$,
  'P0002',
  'not_reportable',
  'A question on a draft listing is not reportable'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000014', 'answer', 'spam')$$,
  'P0002',
  'not_reportable',
  'An answer that does not exist is not reportable'
);

-- A valid report with details: trimmed, snapshot stored.
SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam', '  Spam here  ')$$,
  'A logged-in user can report a question'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000001'
     AND reporter_id = '00000000-0000-4000-8000-000000000003'
     AND target = 'question' AND reason = 'spam'),
  1,
  'The report is stored with the reporter and reason'
);
SELECT is(
  (SELECT details FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000001'
     AND reporter_id = '00000000-0000-4000-8000-000000000003'),
  'Spam here',
  'The details are stored trimmed'
);
SELECT is(
  (SELECT reported_text FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000001'
     AND reporter_id = '00000000-0000-4000-8000-000000000003'),
  'Is it available?',
  'The question text was stored as a snapshot'
);

-- Duplicates.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'offensive')$$,
  'P0001',
  'already_reported',
  'The same question cannot be reported twice by the same user'
);
SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'answer', 'offensive')$$,
  'The answer to the same question can be reported separately'
);

RESET ROLE;

SELECT is(
  (SELECT reported_text FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000001'
     AND reporter_id = '00000000-0000-4000-8000-000000000003' AND target = 'answer'),
  'Thanks again.',
  'The answer text was stored as a snapshot'
);
SELECT ok(
  (SELECT details IS NULL FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000001'
     AND reporter_id = '00000000-0000-4000-8000-000000000003' AND target = 'answer'),
  'Details are optional'
);

-- Seller: can report a question on their own listing, not their own answer.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000014', 'question', 'other')$$,
  'A seller can report a question on their own listing'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'answer', 'spam')$$,
  '42501',
  'own_content',
  'A seller cannot report their own answer'
);

-- Asker: can report the answer, not their own question.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000001', 'question', 'spam')$$,
  '42501',
  'own_content',
  'An asker cannot report their own question'
);
SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000003', 'answer', 'misleading')$$,
  'An asker can report the answer to their question'
);

-- Sold listings: Q&A stays readable, so it stays reportable.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000005', 'answer', 'spam')$$,
  'An answer on a sold listing can be reported'
);
SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000004', 'question', 'spam')$$,
  'A question on a sold listing can be reported'
);

-- Snapshot evidence: the seller edits an answer after it was reported.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000013', 'answer', 'offensive')$$,
  'Reporter 2 reports an answer'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.answer_listing_question('b0000000-0000-4000-8000-000000000013', 'Changed after report.')$$,
  'The seller edits the reported answer'
);

RESET ROLE;

SELECT is(
  (SELECT reported_text FROM public.question_reports
   WHERE question_id = 'b0000000-0000-4000-8000-000000000013'
     AND reporter_id = '00000000-0000-4000-8000-000000000004'),
  'Evidence answer.',
  'The report keeps the original answer text after the seller edits it'
);
SELECT is(
  (SELECT answer FROM public.listing_questions WHERE id = 'b0000000-0000-4000-8000-000000000013'),
  'Changed after report.',
  'The live answer shows the edit'
);

-- Snapshot evidence: the asker deletes a reported question.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000014', 'question', 'spam')$$,
  'Reporter 2 reports a question'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.delete_listing_question('b0000000-0000-4000-8000-000000000014')$$,
  'The asker deletes the reported question'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.question_reports
   WHERE question_id IS NULL AND reported_text = 'Will be deleted'),
  2,
  'Both reports survive the deleted question, with question_id cleared and the snapshot kept'
);

-- Rolling 24 hour report limit.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000008', 'question', 'spam')$$,
  'P0001',
  'report_rate_limited',
  'The 11th report within 24 hours is rejected'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000008', 'question', 'spam')$$,
  'Reports older than 24 hours do not count toward the limit'
);

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000008', 'question', 'spam')$$,
  'The 10th report within 24 hours is accepted'
);
SELECT throws_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000002', 'question', 'spam')$$,
  'P0001',
  'report_rate_limited',
  'The next report is rejected by the 10 per day limit'
);

-- ---------------------------------------------------------------------------
-- 5. Cascades
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.report_listing_content('b0000000-0000-4000-8000-000000000015', 'question', 'spam')$$,
  'Reporter 2 reports a question on the cascade listing'
);

RESET ROLE;

DELETE FROM public.listings WHERE id = 'a0000000-0000-4000-8000-000000000006';

SELECT is(
  (SELECT count(*)::int FROM public.question_reports
   WHERE question_id IS NULL AND reported_text = 'Cascade question'),
  1,
  'Deleting a listing deletes its questions but keeps the report snapshot'
);

SELECT * FROM finish();

ROLLBACK;
