
-- Update checkout reservation function to support delivery methods.

-- Replace the old two-argument function with the new version.
drop function public.create_checkout_reservation(uuid, uuid);

create function public.create_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_delivery_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_existing_reservation public.checkout_reservations%rowtype;
  v_reservation_id uuid;
begin
  -- Validate delivery method.
  if p_delivery_method is null
    or p_delivery_method not in ('shipping', 'pickup')
  then
    raise exception 'Invalid delivery method';
  end if;

  if p_buyer_id is null then
    raise exception 'Buyer ID is required';
  end if;

  -- Lock the listing to prevent concurrent reservations.
  select *
  into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if v_listing.status <> 'published' then
    raise exception 'Listing is not available for purchase';
  end if;

  if v_listing.seller_id = p_buyer_id then
    raise exception 'You cannot purchase your own listing';
  end if;

  -- Check for an existing pending reservation.
  select *
  into v_existing_reservation
  from public.checkout_reservations
  where listing_id = p_listing_id
    and status = 'pending';

  if v_existing_reservation.id is not null then
    raise exception 'Listing is already reserved';
  end if;

  -- Create reservation with the selected delivery method.
  insert into public.checkout_reservations (
    listing_id,
    buyer_id,
    delivery_method,
    expires_at
  )
  values (
    p_listing_id,
    p_buyer_id,
    p_delivery_method,
    now() + interval '30 minutes'
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

-- Only the backend may execute this function.
revoke all on function public.create_checkout_reservation(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.create_checkout_reservation(
  uuid, uuid, text
) to service_role;
