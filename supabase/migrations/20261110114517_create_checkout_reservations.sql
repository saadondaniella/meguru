CREATE TABLE public.checkout_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  listing_id uuid NOT NULL
    REFERENCES public.listings(id),

  buyer_id uuid NOT NULL
    REFERENCES auth.users(id),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),

  expires_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active reservation is allowed per listing.
CREATE UNIQUE INDEX one_pending_reservation_per_listing
ON public.checkout_reservations (listing_id)
WHERE status = 'pending';

-- Protect checkout reservations with Row Level Security.
ALTER TABLE public.checkout_reservations
ENABLE ROW LEVEL SECURITY;