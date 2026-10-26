import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Profile } from '../../services/profile';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-seller-profile',
  imports: [RouterLink],
  templateUrl: './public-seller-profile.html',
  styleUrl: './public-seller-profile.css',
})
export class PublicSellerProfile implements OnInit {
  private route = inject(ActivatedRoute);

  sellerId = this.route.snapshot.paramMap.get('id');

  private profileService = inject(Profile);
  private listingService = inject(ListingService);

  listings = signal<Listing[]>([]);

  seller = signal<{
    id: string;
    display_name: string;
    bio: string | null;
    city: string | null;
  } | null>(null);

  async ngOnInit() {
    if (!this.sellerId) return;

    const { data, error } = await this.profileService.getProfile(this.sellerId);

    if (error) {
      console.error('Error loading seller:', error);
      return;
    }

    this.seller.set(data);
    console.log('Public seller profile:', data);

    const { data: listings, error: listingsError } =
      await this.listingService.getPublishedListingsBySeller(this.sellerId);

    if (listingsError) {
      console.error('Error loading seller listings:', listingsError);
      return;
    }

    this.listings.set(listings ?? []);
    console.log('Seller listings:', listings);
  }

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }
}
