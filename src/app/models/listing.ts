export type ListingCategory = 'exclusive' | 'budget' | 'free';

export type ListingCondition = 'new_with_tags' | 'like_new' | 'very_good' | 'good' | 'well_worn';

export const LISTING_CONDITION_LABELS: Record<ListingCondition, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  well_worn: 'Well worn',
};

export type ListingColor =
  | 'black'
  | 'white'
  | 'grey'
  | 'brown'
  | 'beige'
  | 'blue'
  | 'green'
  | 'red'
  | 'pink'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'multicolour';

// Key order is the order shown in dropdowns.
export const LISTING_COLOR_LABELS: Record<ListingColor, string> = {
  black: 'Black',
  white: 'White',
  grey: 'Grey',
  brown: 'Brown',
  beige: 'Beige',
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  pink: 'Pink',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
  multicolour: 'Multicolour',
};

export const LISTING_COLORS = Object.keys(LISTING_COLOR_LABELS) as ListingColor[];

export type ListingStatus = 'draft' | 'published' | 'sold';

export type ListingSizeType = 'international' | 'eu_clothing' | 'eu_shoes';

export const SIZE_OPTIONS: Record<ListingSizeType, string[]> = {
  international: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
  eu_clothing: ['34', '36', '38', '40', '42', '44'],
  eu_shoes: ['36', '37', '38', '39', '40', '41', '42'],
};

export interface ListingFilterValues {
  search: string;
  category: ListingCategory | null;
  sizeType: ListingSizeType | null;
  size: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  condition: ListingCondition | null;
  color: ListingColor | null;
}

export interface Listing {
  id: string;
  seller_id: string;
  title: string | null;
  description: string | null;
  price: number | null;
  category: ListingCategory | null;
  condition: ListingCondition | null;
  image_path: string | null;
  created_at: string;
  status: ListingStatus;
  brand: string | null;
  size_type: ListingSizeType | null;
  size: string | null;
  color: ListingColor | null;
}
