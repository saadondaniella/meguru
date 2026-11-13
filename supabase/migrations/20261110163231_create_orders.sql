create table public.orders (
  id uuid primary key default gen_random_uuid(),

  reservation_id uuid not null unique
    references public.checkout_reservations(id),

  listing_id uuid not null unique
    references public.listings(id),

  buyer_id uuid not null
    references auth.users(id),

  seller_id uuid not null
    references auth.users(id),

  amount_ore integer not null check (amount_ore > 0),
  currency text not null default 'sek',

  stripe_session_id text not null unique,
  stripe_payment_intent_id text unique,

  status text not null default 'paid'
    check (status in ('paid', 'refunded')),

  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Buyers and sellers can view their orders"
on public.orders
for select
to authenticated
using (
  (select auth.uid()) = buyer_id
  or (select auth.uid()) = seller_id
);