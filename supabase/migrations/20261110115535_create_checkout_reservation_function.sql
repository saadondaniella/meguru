CREATE OR REPLACE FUNCTION public.create_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.listings%ROWTYPE;
  v_existing_reservation public.checkout_reservations%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  SELECT *
INTO v_listing
FROM public.listings
WHERE id = p_listing_id
FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Listing not found';
END IF;

IF v_listing.status <> 'published' THEN
  RAISE EXCEPTION 'Listing is not available for purchase';
END IF;

IF v_listing.seller_id = p_buyer_id THEN
  RAISE EXCEPTION 'You cannot purchase your own listing';
END IF;

IF p_buyer_id IS NULL THEN
  RAISE EXCEPTION 'Buyer ID is required';
END IF;

SELECT *
INTO v_existing_reservation
FROM public.checkout_reservations
WHERE listing_id = p_listing_id
  AND status = 'pending';

  IF v_existing_reservation.id IS NOT NULL THEN
  RAISE EXCEPTION 'Listing is already reserved';
END IF;

INSERT INTO public.checkout_reservations (
  listing_id,
  buyer_id,
  expires_at
)
VALUES (
  p_listing_id,
  p_buyer_id,
  now() + interval '30 minutes'
)
RETURNING id INTO v_reservation_id;

RETURN v_reservation_id;
END;
$$;

-- Prevent direct execution by API users.
REVOKE ALL ON FUNCTION public.create_checkout_reservation(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_checkout_reservation(uuid, uuid)
TO service_role;