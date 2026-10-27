-- Add listing status before applying public visibility policies.

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

ALTER TABLE public.listings
ADD CONSTRAINT listings_status_check
CHECK (status IN ('draft', 'published', 'sold'));

ALTER TABLE public.listings
ADD CONSTRAINT published_listing_required_fields
CHECK (
  status = 'draft'
  OR (
    title IS NOT NULL
    AND length(trim(title)) > 0
    AND price IS NOT NULL
    AND category IS NOT NULL
    AND condition IS NOT NULL
  )
);