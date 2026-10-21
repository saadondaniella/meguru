CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL,
  category text NOT NULL,
  condition text NOT NULL,
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listings
ADD CONSTRAINT listings_price_check
CHECK (price >= 0);

ALTER TABLE public.listings
ADD CONSTRAINT listings_category_check
CHECK (category IN ('exclusive', 'budget', 'free'));

ALTER TABLE public.listings
ADD CONSTRAINT listings_condition_check
CHECK (
  condition IN (
    'new_with_tags',
    'like_new',
    'very_good',
    'good',
    'well_worn'
  )
);

ALTER TABLE public.listings
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view listings"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Users can create their own listings"
ON public.listings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can update their own listings"
ON public.listings
FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Users can delete their own listings"
ON public.listings
FOR DELETE
TO authenticated
USING (auth.uid() = seller_id);

ALTER TABLE public.listings
ADD CONSTRAINT listings_free_price_check
CHECK (
  category != 'free' OR price = 0
);

ALTER TABLE public.listings
ADD CONSTRAINT listings_title_length_check
CHECK (char_length(trim(title)) BETWEEN 1 AND 100);

ALTER TABLE public.listings
ADD CONSTRAINT listings_description_length_check
CHECK (description IS NULL OR char_length(description) <= 2000);