import { describe, it, expect } from 'vitest';
import { Listing } from './listing';
import {
  DEFAULT_LISTING_ORDER,
  STOREFRONT_LISTING_ORDERS,
  resolveListingOrder,
  sortStorefrontListings,
} from './storefront-listing-order';

function listing(id: string, overrides: Partial<Listing> = {}): Listing {
  return {
    id,
    seller_id: 's',
    title: id,
    description: null,
    price: 100,
    category: 'budget',
    condition: 'good',
    image_path: null,
    created_at: '2026-01-01T00:00:00Z',
    status: 'published',
    brand: null,
    size_type: null,
    size: null,
    color: null,
    ...overrides,
  };
}

const ids = (listings: Listing[]) => listings.map((l) => l.id);

describe('storefront listing order', () => {
  it('offers the eight options, newest first by default', () => {
    expect(STOREFRONT_LISTING_ORDERS).toHaveLength(8);
    expect(DEFAULT_LISTING_ORDER).toBe('newest');
  });

  it('falls back to newest for unknown values', () => {
    expect(resolveListingOrder('price_asc')).toBe('price_asc');
    expect(resolveListingOrder('random')).toBe('newest');
    expect(resolveListingOrder(null)).toBe('newest');
    expect(resolveListingOrder(undefined)).toBe('newest');
  });

  const a = listing('a', { created_at: '2026-01-01T00:00:00Z', price: 300 });
  const b = listing('b', { created_at: '2026-03-01T00:00:00Z', price: 100 });
  const c = listing('c', { created_at: '2026-02-01T00:00:00Z', price: 200 });

  it('sorts by date', () => {
    expect(ids(sortStorefrontListings([a, b, c], 'newest'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortStorefrontListings([a, b, c], 'oldest'))).toEqual(['a', 'c', 'b']);
  });

  it('sorts by price', () => {
    expect(ids(sortStorefrontListings([a, b, c], 'price_asc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortStorefrontListings([a, b, c], 'price_desc'))).toEqual(['a', 'c', 'b']);
  });

  it('sorts brands case-insensitively with missing brands last in both directions', () => {
    const zara = listing('zara', { brand: 'Zara' });
    const acne = listing('acne', { brand: 'acne' });
    const none = listing('none', { brand: null });
    const blank = listing('blank', { brand: '  ' });

    expect(ids(sortStorefrontListings([none, zara, blank, acne], 'brand_asc'))).toEqual([
      'acne',
      'zara',
      'blank',
      'none',
    ]);
    expect(ids(sortStorefrontListings([none, zara, blank, acne], 'brand_desc'))).toEqual([
      'zara',
      'acne',
      'blank',
      'none',
    ]);
  });

  it('sorts categories by the label visitors see', () => {
    const exclusive = listing('exclusive', { category: 'exclusive' });
    const budget = listing('budget', { category: 'budget' });
    const free = listing('free', { category: 'free' });

    // Budget, Exclusive, Pass It On
    expect(ids(sortStorefrontListings([free, exclusive, budget], 'category_asc'))).toEqual([
      'budget',
      'exclusive',
      'free',
    ]);
    expect(ids(sortStorefrontListings([free, exclusive, budget], 'category_desc'))).toEqual([
      'free',
      'exclusive',
      'budget',
    ]);
  });

  it('breaks ties newest first, then by id, regardless of input order', () => {
    const older = listing('older', { price: 50, created_at: '2026-01-01T00:00:00Z' });
    const newer = listing('newer', { price: 50, created_at: '2026-02-01T00:00:00Z' });
    const twinA = listing('twin-a', { price: 50, created_at: '2026-01-01T00:00:00Z' });
    const twinB = listing('twin-b', { price: 50, created_at: '2026-01-01T00:00:00Z' });

    const expected = ['newer', 'older', 'twin-a', 'twin-b'];

    // 'older' and the twins share a date, so id decides among them: older < twin-a < twin-b
    expect(ids(sortStorefrontListings([older, newer, twinA, twinB], 'price_asc'))).toEqual(
      expected,
    );
    expect(ids(sortStorefrontListings([twinB, twinA, newer, older], 'price_asc'))).toEqual(
      expected,
    );
  });

  it('keeps sold listings in the same list and does not mutate the input', () => {
    const sold = listing('sold', { status: 'sold', price: 10 });
    const input = [a, sold];

    expect(ids(sortStorefrontListings(input, 'price_asc'))).toEqual(['sold', 'a']);
    expect(ids(input)).toEqual(['a', 'sold']);
  });
});
