-- Remove the old unrestricted public SELECT policy
DROP POLICY IF EXISTS "Anyone can view listings"
ON public.listings;

-- Remove the policy if it was already created manually
DROP POLICY IF EXISTS "Anyone can view public listings"
ON public.listings;

-- Allow public access only to published listings
CREATE POLICY "Anyone can view public listings"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (status = 'published');