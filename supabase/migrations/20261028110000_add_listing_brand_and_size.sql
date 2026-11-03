-- Optional brand and size information for listings.
-- Size type distinguishes international, clothing and shoe sizes.

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS brand text,
ADD COLUMN IF NOT EXISTS size_type text,
ADD COLUMN IF NOT EXISTS size text;

ALTER TABLE public.listings
ADD CONSTRAINT listings_size_type_check
CHECK (
  size_type IS NULL
  OR size_type IN ('international', 'eu_clothing', 'eu_shoes')
);

-- A size and its type must be provided together.
ALTER TABLE public.listings
ADD CONSTRAINT listings_size_pair_check
CHECK (
  (size IS NULL AND size_type IS NULL)
  OR
  (size IS NOT NULL AND size_type IS NOT NULL)
);