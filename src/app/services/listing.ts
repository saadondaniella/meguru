import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import { Listing } from '../models/listing';
import { ListingImageItem } from '../models/listing-image';

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
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      return {
        data: null,
        error: userError ?? new Error('You must be logged in.'),
      };
    }

    const { data, error } = await this.supabase
      .from('listings')
      .delete()
      .eq('id', listingId)
      .eq('seller_id', userData.user.id)
      .select()
      .maybeSingle();

    if (error) {
      return { data: null, error };
    }

    if (!data) {
      return {
        data: null,
        error: new Error('Listing was not deleted.'),
      };
    }

    return { data, error: null };
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

  // GET ADDITIONAL IMAGES FOR A LISTING
  async getListingImages(listingId: string) {
    return await this.supabase
      .from('listing_images')
      .select('id, listing_id, image_path, position')
      .eq('listing_id', listingId)
      .order('position', { ascending: true });
  }

  // ALL IMAGE PATHS OF A LISTING IN DISPLAY ORDER (MAIN IMAGE FIRST)
  async getListingImagePaths(listing: Pick<Listing, 'id' | 'image_path'>) {
    const { data, error } = await this.getListingImages(listing.id);

    if (error) {
      return { data: null, error };
    }

    const paths = [
      ...(listing.image_path ? [listing.image_path] : []),
      ...(data ?? []).map((image) => image.image_path),
    ];

    return { data: paths, error: null };
  }

  /**
   * Makes `items` (in order, first = main image) the listing's image set.
   *
   * 1. Uploads new files.
   * 2. Replaces the image set atomically through the `set_listing_images` RPC.
   * 3. Only after the database change is confirmed, deletes files that are no
   *    longer referenced.
   *
   * If anything fails before the database change is confirmed, only the files
   * uploaded by this call are removed, and only when the database does not
   * reference them. Existing files are never deleted before the commit.
   */
  async saveListingImages(listingId: string, userId: string, items: ListingImageItem[]) {
    const uploadedPaths: string[] = [];

    try {
      const orderedPaths: string[] = [];

      for (const item of items) {
        if (item.kind === 'existing') {
          orderedPaths.push(item.imagePath);
          continue;
        }

        const { data, error } = await this.uploadListingImage(userId, item.file);

        if (error || !data) {
          throw error ?? new Error('Image upload failed.');
        }

        uploadedPaths.push(data.path);
        orderedPaths.push(data.path);
      }

      const { data: removedPaths, error } = await this.supabase.rpc('set_listing_images', {
        p_listing_id: listingId,
        p_image_paths: orderedPaths,
      });

      if (error) {
        throw error;
      }

      // The database now matches `orderedPaths`; unreferenced files can go.
      for (const path of (removedPaths as string[] | null) ?? []) {
        const { error: removeError } = await this.deleteListingImage(path);

        if (removeError) {
          console.error('Could not remove unused image from storage:', path, removeError);
        }
      }

      return { error: null };
    } catch (error) {
      await this.cleanUpUnreferencedUploads(listingId, uploadedPaths);

      return { error: error instanceof Error ? error : new Error('Could not save images.') };
    }
  }

  // The RPC response may have been lost even though the change was committed,
  // so only delete uploads the database does not reference. If that cannot be
  // verified, keep the files: an orphan is better than a broken image link.
  private async cleanUpUnreferencedUploads(listingId: string, uploadedPaths: string[]) {
    if (uploadedPaths.length === 0) return;

    const { data: listing, error: listingError } = await this.supabase
      .from('listings')
      .select('id, image_path')
      .eq('id', listingId)
      .maybeSingle();

    if (listingError || !listing) {
      console.error('Could not verify uploaded images, keeping them:', listingError);
      return;
    }

    const { data: referenced, error } = await this.getListingImagePaths(listing);

    if (error || !referenced) {
      console.error('Could not verify uploaded images, keeping them:', error);
      return;
    }

    for (const path of uploadedPaths.filter((path) => !referenced.includes(path))) {
      const { error: removeError } = await this.deleteListingImage(path);

      if (removeError) {
        console.error('Could not clean up uploaded image:', path, removeError);
      }
    }
  }
}
