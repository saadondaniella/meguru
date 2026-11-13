
-- Add delivery information to checkout reservations.
alter table public.checkout_reservations
add column delivery_method text
check (delivery_method in ('shipping', 'pickup'));

-- Add delivery information to completed orders.
alter table public.orders
add column delivery_method text
check (delivery_method in ('shipping', 'pickup'));

-- Store the shipping address for shipped orders.
alter table public.orders
add column shipping_address jsonb;
