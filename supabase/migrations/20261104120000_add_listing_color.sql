-- Optional primary color for listings.
-- The column stays nullable: existing listings and drafts have no color.
-- A color is required when publishing through the app form, not in the database.

ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.listings
ADD CONSTRAINT listings_color_check
CHECK (
  color IS NULL
  OR color IN (
    'black',
    'white',
    'grey',
    'brown',
    'beige',
    'blue',
    'green',
    'red',
    'pink',
    'yellow',
    'purple',
    'orange',
    'multicolour'
  )
);
