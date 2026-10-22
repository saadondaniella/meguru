export type ListingCategory = 'exclusive' | 'budget' | 'free';

export type ListingCondition =
  | 'new_with_tags'
  | 'like_new'
  | 'very_good'
  | 'good'
  | 'well_worn';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price: number;
  category: ListingCategory;
  condition: ListingCondition;
  image_path: string | null;
  created_at: string;
}