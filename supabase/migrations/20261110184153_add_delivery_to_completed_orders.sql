
-- Update order completion to include delivery method and shipping address.
-- Only the backend (service_role) may execute this function.

-- Remove the old function signature.
drop function public.complete_checkout_order(
  uuid, text, text, integer, text
);

create function public.complete_checkout_order(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_ore integer,
  p_currency text,
  p_shipping_address jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.checkout_reservations%rowtype;
  v_seller_id uuid;
  v_price numeric;
  v_order_id uuid;
begin
  -- Lock the reservation to prevent concurrent processing.
  select *
  into v_reservation
  from public.checkout_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found';
  end if;

  -- Verify that the Stripe session matches the reservation.
  if v_reservation.stripe_session_id is distinct from p_stripe_session_id then
    raise exception 'Stripe session mismatch';
  end if;

  -- Return the existing order if already processed.
  if v_reservation.status = 'completed' then
    select id
    into v_order_id
    from public.orders
    where reservation_id = p_reservation_id
      and stripe_session_id = p_stripe_session_id;

    if v_order_id is null then
      raise exception 'Completed reservation has no order';
    end if;

    return v_order_id;
  end if;

  if v_reservation.status <> 'pending' then
    raise exception 'Reservation is not pending';
  end if;

  -- Validate delivery method.
  if v_reservation.delivery_method is null
    or v_reservation.delivery_method not in ('shipping', 'pickup')
  then
    raise exception 'Invalid delivery method';
  end if;

  -- Shipping orders must have an address.
  if v_reservation.delivery_method = 'shipping' then
    if p_shipping_address is null
      or jsonb_typeof(p_shipping_address) <> 'object'
      or nullif(p_shipping_address->>'line1', '') is null
      or nullif(p_shipping_address->>'postal_code', '') is null
      or nullif(p_shipping_address->>'city', '') is null
      or p_shipping_address->>'country' <> 'SE'
    then
      raise exception 'Valid shipping address is required';
    end if;
  else
    -- Pickup orders do not need a shipping address.
    if p_shipping_address is not null then
      raise exception 'Pickup orders must not have a shipping address';
    end if;
  end if;

  -- Lock the listing and retrieve seller and price.
  select seller_id, price
  into v_seller_id, v_price
  from public.listings
  where id = v_reservation.listing_id
    and status = 'published'
  for update;

  if not found then
    raise exception 'Listing is not available';
  end if;

  if v_seller_id = v_reservation.buyer_id then
    raise exception 'Buyer cannot purchase their own listing';
  end if;

  -- Confirm the payment amount matches the listing price.
  if p_amount_ore is null
    or p_amount_ore <= 0
    or p_amount_ore <> round(v_price * 100)::integer
  then
    raise exception 'Payment amount mismatch';
  end if;

  if lower(coalesce(p_currency, '')) <> 'sek' then
    raise exception 'Unsupported currency';
  end if;

  if nullif(p_stripe_payment_intent_id, '') is null then
    raise exception 'Missing Stripe payment intent';
  end if;

  -- Create the order with delivery information.
  insert into public.orders (
    reservation_id,
    listing_id,
    buyer_id,
    seller_id,
    amount_ore,
    currency,
    stripe_session_id,
    stripe_payment_intent_id,
    delivery_method,
    shipping_address,
    status
  )
  values (
    v_reservation.id,
    v_reservation.listing_id,
    v_reservation.buyer_id,
    v_seller_id,
    p_amount_ore,
    'sek',
    p_stripe_session_id,
    p_stripe_payment_intent_id,
    v_reservation.delivery_method,
    p_shipping_address,
    'paid'
  )
  returning id into v_order_id;

  -- Complete the reservation.
  update public.checkout_reservations
  set status = 'completed'
  where id = v_reservation.id;

  -- Mark the listing as sold.
  update public.listings
  set status = 'sold'
  where id = v_reservation.listing_id;

  return v_order_id;
end;
$$;

-- Restrict execution to the backend.
revoke all on function public.complete_checkout_order(
  uuid, text, text, integer, text, jsonb
) from public, anon, authenticated;

grant execute on function public.complete_checkout_order(
  uuid, text, text, integer, text, jsonb
) to service_role;
