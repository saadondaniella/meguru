export type ListingCategory = 'exclusive' | 'budget' | 'free';

export type ListingCondition = 'new_with_tags' | 'like_new' | 'very_good' | 'good' | 'well_worn';

export type ListingStatus = 'draft' | 'published' | 'sold';

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
}
