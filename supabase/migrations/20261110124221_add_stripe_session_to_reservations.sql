ALTER TABLE public.checkout_reservations
ADD COLUMN stripe_session_id text UNIQUE;

-- - ALTER TABLE – vi ändrar en tabell som redan finns.
-- - ADD COLUMN – vi lägger till en ny kolumn.
-- - text – Stripe Session ID är en textsträng, inte ett UUID.
-- - UNIQUE – två reservationer får inte ha samma Stripe Session ID.