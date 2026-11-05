-- Seller storefront listing order (Issue #37).
--
-- Lets a seller choose the default sorting rule for THE WARDROBE on their
-- public storefront. Only the rule is stored, as a key. The sorting itself
-- happens in the app, so Marketplace sorting is unaffected.
--
-- Existing profiles receive 'newest', which matches today's storefront.
--
-- Row Level Security is unchanged: "Anyone can view profiles" lets the public
-- storefront read this column, and the existing owner-only INSERT and UPDATE
-- policies (auth.uid() = id) already cover it.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS storefront_listing_order text NOT NULL DEFAULT 'newest';

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_listing_order_check
CHECK (
  storefront_listing_order IN (
    'newest',
    'oldest',
    'price_asc',
    'price_desc',
    'brand_asc',
    'brand_desc',
    'category_asc',
    'category_desc'
  )
);
