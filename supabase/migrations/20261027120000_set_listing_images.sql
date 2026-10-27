
-- Atomic image management for listings (Issue #12).
--
-- The ordered array of storage paths represents the listing's images:
--   p_image_paths[1]    = main image in listings.image_path
--   p_image_paths[2..5] = additional images in listing_images
--
-- The listing_images table and its RLS policies already exist in Supabase.
-- This migration only creates the RPC function.
--
-- Database changes run in one transaction.
-- Removed Storage paths are returned to the client for cleanup
-- after the database transaction succeeds.

CREATE OR REPLACE FUNCTION public.set_listing_images(
  p_listing_id uuid,
  p_image_paths text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_seller_id uuid;
  v_paths text[] := COALESCE(p_image_paths, ARRAY[]::text[]);
  v_count int := COALESCE(cardinality(p_image_paths), 0);
  v_old_paths text[];
  v_path text;
  i int;
BEGIN
  -- The user must be authenticated.
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.'
      USING ERRCODE = '28000';
  END IF;

  -- Lock the listing while updating its images.
  -- Verify that the authenticated user owns the listing.
  SELECT seller_id
  INTO v_seller_id
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND OR v_seller_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Listing not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Maximum five images per listing.
  IF v_count > 5 THEN
    RAISE EXCEPTION 'A listing can have at most 5 images.'
      USING ERRCODE = '22023';
  END IF;

  -- Reject duplicate image paths.
  IF (
    SELECT COUNT(DISTINCT p)
    FROM unnest(v_paths) AS p
  ) <> v_count THEN
    RAISE EXCEPTION 'Duplicate image paths are not allowed.'
      USING ERRCODE = '22023';
  END IF;

  -- Only allow image paths in the seller's own Storage folder.
  FOREACH v_path IN ARRAY v_paths LOOP
    IF v_path IS NULL
       OR v_path = ''
       OR position('..' IN v_path) > 0
       OR left(v_path, length(v_seller_id::text) + 1)
          <> v_seller_id::text || '/'
    THEN
      RAISE EXCEPTION 'Invalid image path.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Collect all previously referenced images.
  SELECT COALESCE(array_agg(p), ARRAY[]::text[])
  INTO v_old_paths
  FROM (
    SELECT image_path AS p
    FROM public.listings
    WHERE id = p_listing_id
      AND image_path IS NOT NULL

    UNION

    SELECT image_path AS p
    FROM public.listing_images
    WHERE listing_id = p_listing_id
  ) AS old;

  -- Replace the additional image records.
  DELETE FROM public.listing_images
  WHERE listing_id = p_listing_id;

  -- Store additional images in positions 1–4.
  FOR i IN 2..v_count LOOP
    INSERT INTO public.listing_images (
      listing_id,
      image_path,
      position
    )
    VALUES (
      p_listing_id,
      v_paths[i],
      i - 1
    );
  END LOOP;

  -- The first image becomes the main image.
  -- An empty array removes all images from the listing.
  UPDATE public.listings
  SET image_path = CASE
    WHEN v_count > 0 THEN v_paths[1]
    ELSE NULL
  END
  WHERE id = p_listing_id;

  -- Return paths no longer referenced by this listing.
  RETURN ARRAY(
    SELECT unnest(v_old_paths)
    EXCEPT
    SELECT unnest(v_paths)
  );
END;
$$;

-- Only authenticated users may execute the function.
REVOKE ALL
ON FUNCTION public.set_listing_images(uuid, text[])
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.set_listing_images(uuid, text[])
TO authenticated;
