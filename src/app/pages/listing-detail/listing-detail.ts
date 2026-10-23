import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { Profile } from '../../services/profile';

@Component({
  imports: [RouterLink],
  selector: 'app-listing-detail',
  styleUrl: './listing-detail.css',
  templateUrl: './listing-detail.html',
})
export class ListingDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private listingService = inject(ListingService);
  private profileService = inject(Profile);

  listingId = this.route.snapshot.paramMap.get('id');
  listing = signal<Listing | null>(null);
  imageUrl = signal<string | null>(null);
  seller = signal<{ id: string; display_name: string } | null>(null);

  ngOnInit() {
    console.log('ListingDetail initialized');
    this.loadListing();
  }

  async loadListing() {
    if (!this.listingId) {
      console.error('No listing ID found');
      return;
    }

    console.log('Starting Supabase request');

    const { data, error } = await this.listingService.getListingById(this.listingId);

    console.log('Supabase request finished', { data, error });

    if (error) {
      console.error('Error loading listing:', error.message);
      return;
    }

    this.listing.set(data);
    const { data: seller, error: profileError } = await this.profileService.getProfile(
      data.seller_id,
    );

    if (profileError) {
      console.error('Error loading seller profile:', profileError);
    } else {
      console.log('Seller profile:', seller);
      this.seller.set(seller);
    }
    if (data.image_path) {
      this.imageUrl.set(this.listingService.getListingImageUrl(data.image_path));
    }
  }
}
