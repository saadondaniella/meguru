-- Favourite (saved) listings.
--
-- This table and function were originally created by hand in the Supabase
-- SQL Editor. This migration records them so a fresh database matches the
-- live one. It is written to be safe to run where they already exist.

-- A user can save a listing once. Deleting the user or the listing removes
-- the favourite.

CREATE TABLE IF NOT EXISTS public.favourites (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  listing_id uuid NOT NULL
    REFERENCES public.listings(id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.favourites
ENABLE ROW LEVEL SECURITY;

-- Users can only see, add and remove their own favourites.
-- There is no UPDATE policy: a favourite is never edited.

DROP POLICY IF EXISTS "Users can view their own favourites"
ON public.favourites;

CREATE POLICY "Users can view their own favourites"
ON public.favourites
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add their own favourites"
ON public.favourites;

CREATE POLICY "Users can add their own favourites"
ON public.favourites
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own favourites"
ON public.favourites;

CREATE POLICY "Users can delete their own favourites"
ON public.favourites
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Table privileges.
-- Row Level Security does not apply to TRUNCATE, so a role holding TRUNCATE
-- could delete every user's favourites. The live table currently grants
-- anon and authenticated all privileges, including TRUNCATE, TRIGGER and
-- REFERENCES. The app only needs SELECT, INSERT and DELETE for logged-in
-- users, so only those are granted. service_role and postgres are unchanged.

REVOKE ALL ON TABLE public.favourites FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
ON TABLE public.favourites
TO authenticated;

-- Public favourite count for a published listing.
-- SECURITY DEFINER lets anyone, including logged-out visitors, read the
-- count without being able to read other users' favourites. It returns only
-- a number, and an empty search_path forces fully qualified names.

CREATE OR REPLACE FUNCTION public.get_listing_favourite_count(p_listing_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COUNT(*)
  FROM public.favourites
  WHERE listing_id = p_listing_id
    AND EXISTS (
      SELECT 1
      FROM public.listings
      WHERE id = p_listing_id
        AND status = 'published'
    );
$function$;

REVOKE ALL ON FUNCTION public.get_listing_favourite_count(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_listing_favourite_count(uuid)
TO anon, authenticated, service_role;
