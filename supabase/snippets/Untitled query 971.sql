UPDATE public.checkout_reservations
SET status = 'cancelled'
WHERE id = '6c935ac2-d1b4-426c-883c-16588e914ac0'
  AND status = 'pending'
  AND stripe_session_id IS NULL
RETURNING id, status;