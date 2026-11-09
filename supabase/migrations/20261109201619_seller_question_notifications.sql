-- Count unanswered questions on the signed-in seller's published listings.
-- Only returns counts for listings owned by the current user.

CREATE OR REPLACE FUNCTION public.get_seller_unanswered_questions()
RETURNS TABLE (
  listing_id uuid,
  unanswered_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    l.id AS listing_id,
    COUNT(q.id) AS unanswered_count
  FROM public.listings AS l
  JOIN public.listing_questions AS q
    ON q.listing_id = l.id
  WHERE l.seller_id = (SELECT auth.uid())
    AND l.status = 'published'
    AND q.answer IS NULL
    AND NOT q.is_hidden
  GROUP BY l.id;
$$;

-- Only signed-in users can call this function.
REVOKE ALL ON FUNCTION public.get_seller_unanswered_questions()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_seller_unanswered_questions()
TO authenticated;