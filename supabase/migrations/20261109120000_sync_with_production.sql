-- Sync the migration history with the live MEGURU production schema.
--
-- Production was originally built by hand in the Supabase SQL Editor. These
-- changes exist in production but were never recorded in a migration.
-- Every statement is idempotent, so it is safe where the objects already exist.
--
-- Deliberately NOT included (separate decisions):
--   - public.swap_listing_main_image (not called by the Angular app)
--   - the broader favourites table grants that production still has
--   - public.rls_auto_enable (hosted-platform helper)

-- Drafts may have empty fields. The published_listing_required_fields check
-- (20261026200000) enforces required fields once a listing is published.

ALTER TABLE public.listings
ALTER COLUMN title DROP NOT NULL,
ALTER COLUMN price DROP NOT NULL,
ALTER COLUMN category DROP NOT NULL,
ALTER COLUMN condition DROP NOT NULL;

-- Seller avatar image path (Storage object path in the avatars bucket).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_path text;

-- Public bucket for seller avatars.
-- Only JPEG, PNG and WebP images up to 5 MB are allowed.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Avatar Storage policies: authenticated users can only manage files inside
-- their own folder (first path segment = their user id).

DROP POLICY IF EXISTS "Users can read their own avatar objects"
ON storage.objects;

CREATE POLICY "Users can read their own avatar objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload their own avatars"
ON storage.objects;

CREATE POLICY "Users can upload their own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own avatars"
ON storage.objects;

CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own avatars"
ON storage.objects;

CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
