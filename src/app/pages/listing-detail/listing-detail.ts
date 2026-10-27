import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, NavigationStart } from '@angular/router';
import { Location } from '@angular/common';
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
  private router = inject(Router);
  private location = inject(Location);

  listingId = this.route.snapshot.paramMap.get('id');
  listing = signal<Listing | null>(null);
  imageUrls = signal<string[]>([]);
  selectedImageIndex = signal(0);
  selectedImageUrl = computed(() => this.imageUrls()[this.selectedImageIndex()] ?? null);
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

    await this.loadImages(data);
  }

  private async loadImages(listing: Listing) {
    const { data: paths, error } = await this.listingService.getListingImagePaths(listing);

    if (error) {
      console.error('Error loading listing images:', error);
    }

    // Fall back to the main image so the page still shows something.
    const imagePaths = paths ?? (listing.image_path ? [listing.image_path] : []);

    this.imageUrls.set(imagePaths.map((path) => this.listingService.getListingImageUrl(path)));
    this.selectedImageIndex.set(0);
  }

  selectImage(index: number) {
    if (index >= 0 && index < this.imageUrls().length) {
      this.selectedImageIndex.set(index);
    }
  }

  // Wraps around at both ends.
  stepImage(step: number) {
    const count = this.imageUrls().length;

    if (count > 1) {
      this.selectedImageIndex.update((index) => (index + step + count) % count);
    }
  }

  onGalleryKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      this.stepImage(-1);
    } else if (event.key === 'ArrowRight') {
      this.stepImage(1);
    } else {
      return;
    }

    event.preventDefault();
  }

  goBack() {
    if (window.history.state?.fromMarketplace) {
      this.location.back();
    } else {
      void this.router.navigate(['/marketplace']);
    }
  }
}
