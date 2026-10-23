import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';

@Component({
  imports: [],
  selector: 'app-listing-detail',
  styleUrl: './listing-detail.css',
  templateUrl: './listing-detail.html',
})
export class ListingDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private listingService = inject(ListingService);

  listingId = this.route.snapshot.paramMap.get('id');
  listing = signal<Listing | null>(null);
  imageUrl: string | null = null;

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
    if (data.image_path) {
      this.imageUrl = this.listingService.getListingImageUrl(data.image_path);
    }
  }
}
