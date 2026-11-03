-- Remove the old unrestricted public SELECT policy
DROP POLICY IF EXISTS "Anyone can view listings"
ON public.listings;

-- Remove the policy if it was already created manually
DROP POLICY IF EXISTS "Anyone can view public listings"
ON public.listings;

-- Allow public access to published and sold listings
CREATE POLICY "Anyone can view public listings"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (status IN ('published', 'sold'));

-- Allow sellers to view their own listings, including drafts
DROP POLICY IF EXISTS "Sellers can view their own listings"
ON public.listings;

CREATE POLICY "Sellers can view their own listings"
ON public.listings
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = seller_id);