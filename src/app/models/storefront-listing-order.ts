import { Listing, ListingCategory } from './listing';

// How a seller's listings are ordered under THE WARDROBE on their public
// storefront. The database stores the KEY only (see the profiles CHECK
// constraint), and unknown values always fall back to 'newest'.

export type StorefrontListingOrder =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'brand_asc'
  | 'brand_desc'
  | 'category_asc'
  | 'category_desc';

export const STOREFRONT_LISTING_ORDERS: readonly {
  key: StorefrontListingOrder;
  label: string;
}[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'price_asc', label: 'Price: Low to high' },
  { key: 'price_desc', label: 'Price: High to low' },
  { key: 'brand_asc', label: 'Brand: A–Z' },
  { key: 'brand_desc', label: 'Brand: Z–A' },
  { key: 'category_asc', label: 'Category: A–Z' },
  { key: 'category_desc', label: 'Category: Z–A' },
];

export const DEFAULT_LISTING_ORDER: StorefrontListingOrder = 'newest';

export function resolveListingOrder(value: unknown): StorefrontListingOrder {
  return (
    STOREFRONT_LISTING_ORDERS.find((order) => order.key === value)?.key ?? DEFAULT_LISTING_ORDER
  );
}

// Category is sorted by the label visitors read, not the stored key.
const CATEGORY_LABELS: Record<ListingCategory, string> = {
  exclusive: 'Exclusive',
  budget: 'Affordable',
  free: 'Pass It On',
};

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

// Empty values always go last, in both directions.
function compareOptionalText(a: string | null, b: string | null, direction: 1 | -1): number {
  const left = a?.trim() ?? '';
  const right = b?.trim() ?? '';

  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  return direction * compareText(left, right);
}

function categoryLabel(listing: Listing): string | null {
  return listing.category ? CATEGORY_LABELS[listing.category] : null;
}

function compareNewest(a: Listing, b: Listing): number {
  // ISO timestamps compare correctly as strings.
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function comparePrice(a: Listing, b: Listing, direction: 1 | -1): number {
  return direction * ((a.price ?? 0) - (b.price ?? 0));
}

/**
 * Returns a sorted copy. Listings with equal values fall back to newest first,
 * then to id, so the order is always stable.
 */
export function sortStorefrontListings(
  listings: readonly Listing[],
  order: StorefrontListingOrder,
): Listing[] {
  const primary = (a: Listing, b: Listing): number => {
    switch (order) {
      case 'oldest':
        return -compareNewest(a, b);
      case 'price_asc':
        return comparePrice(a, b, 1);
      case 'price_desc':
        return comparePrice(a, b, -1);
      case 'brand_asc':
        return compareOptionalText(a.brand, b.brand, 1);
      case 'brand_desc':
        return compareOptionalText(a.brand, b.brand, -1);
      case 'category_asc':
        return compareOptionalText(categoryLabel(a), categoryLabel(b), 1);
      case 'category_desc':
        return compareOptionalText(categoryLabel(a), categoryLabel(b), -1);
      default:
        return compareNewest(a, b);
    }
  };

  return [...listings].sort((a, b) => primary(a, b) || compareNewest(a, b));
}
