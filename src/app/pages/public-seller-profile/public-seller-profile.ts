import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Profile } from '../../services/profile';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { SUPABASE_CLIENT } from '../../services/supabase';
import {
  SellerStorefront,
  StorefrontSeller,
} from '../../components/seller-storefront/seller-storefront';
import { StorefrontStyleColumns, resolveStorefrontStyle } from '../../models/storefront-theme';

@Component({
  selector: 'app-public-seller-profile',
  imports: [SellerStorefront],
  templateUrl: './public-seller-profile.html',
  styleUrl: './public-seller-profile.css',
})
export class PublicSellerProfile implements OnInit {
  private route = inject(ActivatedRoute);

  sellerId = this.route.snapshot.paramMap.get('id');

  private profileService = inject(Profile);
  private listingService = inject(ListingService);
  private supabase = inject(SUPABASE_CLIENT);

  isOwnProfile = signal(false);

  listings = signal<Listing[]>([]);

  seller = signal<
    | ({
        id: string;
        display_name: string;
        tagline?: string | null;
        bio: string | null;
        city: string | null;
        avatar_path: string | null;
        contact_email: string | null;
        instagram: string | null;
      } & StorefrontStyleColumns)
    | null
  >(null);

  // Legacy profiles have no style columns and resolve to the defaults.
  style = computed(() => resolveStorefrontStyle(this.seller()));

  storefrontSeller = computed<StorefrontSeller | null>(() => {
    const seller = this.seller();

    if (!seller) return null;

    return {
      display_name: seller.display_name,
      tagline: seller.tagline ?? null,
      bio: seller.bio,
      city: seller.city,
      contact_email: seller.contact_email,
      instagram: seller.instagram,
      avatarUrl: this.getAvatarUrl(seller.avatar_path),
    };
  });

  async ngOnInit() {
    if (!this.sellerId) return;

    await this.checkProfileOwnership();

    const { data, error } = await this.profileService.getProfile(this.sellerId);

    if (error) {
      console.error('Error loading seller:', error);
      return;
    }

    this.seller.set(data);

    const { data: listings, error: listingsError } =
      await this.listingService.getPublishedListingsBySeller(this.sellerId);

    if (listingsError) {
      console.error('Error loading seller listings:', listingsError);
      return;
    }

    this.listings.set(listings ?? []);
  }

  getAvatarUrl(avatarPath: string | null): string | null {
    return this.profileService.getAvatarUrl(avatarPath);
  }

  private async checkProfileOwnership() {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user) {
      this.isOwnProfile.set(false);
      return;
    }

    this.isOwnProfile.set(data.user.id === this.sellerId);
  }
}
