import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import { Listing } from '../models/listing';

type CreateListing = Pick<
  Listing,
  'seller_id' | 'title' | 'description' | 'price' | 'category' | 'condition' | 'image_path'
> & {
  status?: Listing['status'];
};

@Injectable({
  providedIn: 'root',
})
export class ListingService {
  private supabase = inject(SUPABASE_CLIENT);

  async createListing(listing: CreateListing) {
    return await this.supabase.from('listings').insert(listing).select().single();
  }

  async getListingsBySeller(sellerId: string) {
    return await this.supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });
  }

  async getPublishedListingsBySeller(sellerId: string) {
    return await this.supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .in('status', ['published', 'sold'])
      .order('created_at', { ascending: false });
  }

  async getAllListings(page = 1, pageSize = 9) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    return await this.supabase
      .from('listings')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(from, to);
  }

  async getListingById(listingId: string) {
    return await this.supabase.from('listings').select('*').eq('id', listingId).single();
  }

  async updateListing(
    listingId: string,
    updates: Partial<Omit<Listing, 'id' | 'seller_id' | 'created_at'>>,
  ) {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      return {
        data: null,
        error: userError ?? new Error('You must be logged in.'),
      };
    }

    return await this.supabase
      .from('listings')
      .update(updates)
      .eq('id', listingId)
      .eq('seller_id', userData.user.id)
      .select()
      .single();
  }

  async deleteListing(listingId: string) {
    return await this.supabase.from('listings').delete().eq('id', listingId).select().single();
  }

  async uploadListingImage(userId: string, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();

    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    return await this.supabase.storage.from('listing-images').upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });
  }

  getListingImageUrl(imagePath: string): string {
    const { data } = this.supabase.storage.from('listing-images').getPublicUrl(imagePath);

    return data.publicUrl;
  }

  async deleteListingImage(imagePath: string) {
    return await this.supabase.storage.from('listing-images').remove([imagePath]);
  }
}
