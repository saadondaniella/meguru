import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { ListingService } from '../../services/listing';
import { Listing, LISTING_CONDITION_LABELS } from '../../models/listing';
import { Profile } from '../../services/profile';
import { FavouriteButton } from '../../components/favourite-button/favourite-button';
import { ListingCard } from '../../components/listing-card/listing-card';

@Component({
  imports: [RouterLink, FavouriteButton, ListingCard],
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

  listingId: string | null = null;

  listing = signal<Listing | null>(null);
  imageUrls = signal<string[]>([]);
  selectedImageIndex = signal(0);
  selectedImageUrl = computed(() => this.imageUrls()[this.selectedImageIndex()] ?? null);

  seller = signal<{ id: string; display_name: string } | null>(null);
  relatedListings = signal<Listing[]>([]);

  readonly conditionLabels = LISTING_CONDITION_LABELS;

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.listingId = params.get('id');

      // Clear previous listing data when navigating to another listing.
      this.listing.set(null);
      this.seller.set(null);
      this.relatedListings.set([]);
      this.imageUrls.set([]);
      this.selectedImageIndex.set(0);

      void this.loadListing();
    });
  }

  async loadListing() {
    const requestedId = this.listingId;

    if (!requestedId) {
      console.error('No listing ID found');
      return;
    }

    const { data, error } = await this.listingService.getListingById(requestedId);

    // Ignore responses belonging to a previous listing.
    if (requestedId !== this.listingId) return;

    if (error || !data) {
      console.error('Error loading listing:', error);
      return;
    }

    this.listing.set(data);

    // Load additional information independently.
    void this.loadRecommendations(data);
    void this.loadImages(data);

    const { data: seller, error: profileError } = await this.profileService.getProfile(
      data.seller_id,
    );

    // The visitor may have navigated to another listing.
    if (requestedId !== this.listingId) return;

    if (profileError) {
      console.error('Error loading seller profile:', profileError);
    } else {
      this.seller.set(seller);
    }
  }

  private async loadRecommendations(listing: Listing) {
    const { data, error } = await this.listingService.getRelatedListings(listing);

    // Ignore recommendations from a previous listing.
    if (listing.id !== this.listingId) return;

    if (error) {
      console.error('Error loading related products:', error);
      return;
    }

    this.relatedListings.set(data ?? []);
  }

  private async loadImages(listing: Listing) {
    const { data: paths, error } = await this.listingService.getListingImagePaths(listing);

    // Ignore images belonging to a previous listing.
    if (listing.id !== this.listingId) return;

    if (error) {
      console.error('Error loading listing images:', error);
    }

    // Fall back to the main image if additional images cannot load.
    const imagePaths = paths ?? (listing.image_path ? [listing.image_path] : []);

    this.imageUrls.set(imagePaths.map((path) => this.listingService.getListingImageUrl(path)));

    this.selectedImageIndex.set(0);
  }

  selectImage(index: number) {
    if (index >= 0 && index < this.imageUrls().length) {
      this.selectedImageIndex.set(index);
    }
  }

  // Wrap around at both ends.
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
