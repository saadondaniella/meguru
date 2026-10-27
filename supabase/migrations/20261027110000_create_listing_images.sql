-- Create the table for additional listing images (Issue #12).
-- The main image is stored in public.listings.image_path.
-- Each listing can have up to four additional images.

CREATE TABLE IF NOT EXISTS public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  listing_id uuid NOT NULL
    REFERENCES public.listings(id) ON DELETE CASCADE,

  image_path text NOT NULL,

  position integer NOT NULL
    CONSTRAINT listing_images_position_check
    CHECK (position BETWEEN 1 AND 4),

  CONSTRAINT listing_images_listing_id_image_path_key
    UNIQUE (listing_id, image_path),

  CONSTRAINT listing_images_listing_id_position_key
    UNIQUE (listing_id, position)
);

CREATE INDEX IF NOT EXISTS listing_images_listing_id_idx
ON public.listing_images (listing_id);

ALTER TABLE public.listing_images
ENABLE ROW LEVEL SECURITY;

-- Public users can view images belonging to published or sold listings.

CREATE POLICY "Anyone can view public listing images"
ON public.listing_images
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.status IN ('published', 'sold')
  )
);

-- Sellers can view images belonging to their own listings,
-- including drafts.

CREATE POLICY "Sellers can view own listing images"
ON public.listing_images
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.seller_id = (SELECT auth.uid())
  )
);

-- Sellers can add images to their own listings.

CREATE POLICY "Sellers can add own listing images"
ON public.listing_images
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.seller_id = (SELECT auth.uid())
  )
);

-- Sellers can update images belonging to their own listings.

CREATE POLICY "Sellers can update own listing images"
ON public.listing_images
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.seller_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.seller_id = (SELECT auth.uid())
  )
);

-- Sellers can delete images belonging to their own listings.

CREATE POLICY "Sellers can delete own listing images"
ON public.listing_images
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND listings.seller_id = (SELECT auth.uid())
  )
);