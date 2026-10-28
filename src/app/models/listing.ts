export type ListingCategory = 'exclusive' | 'budget' | 'free';

export type ListingCondition = 'new_with_tags' | 'like_new' | 'very_good' | 'good' | 'well_worn';

export type ListingStatus = 'draft' | 'published' | 'sold';

export type ListingSizeType = 'international' | 'eu_clothing' | 'eu_shoes';

export const SIZE_OPTIONS: Record<ListingSizeType, string[]> = {
  international: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
  eu_clothing: ['34', '36', '38', '40', '42', '44'],
  eu_shoes: ['36', '37', '38', '39', '40', '41', '42'],
};

export interface ListingFilterValues {
  brand: string;
  sizeType: ListingSizeType | null;
  size: string | null;
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
}
