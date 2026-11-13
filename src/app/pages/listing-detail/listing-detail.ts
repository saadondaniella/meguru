import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { ListingService } from '../../services/listing';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Listing, LISTING_COLOR_LABELS, LISTING_CONDITION_LABELS } from '../../models/listing';
import { Profile } from '../../services/profile';
import { FavouriteButton } from '../../components/favourite-button/favourite-button';
import { ListingCard } from '../../components/listing-card/listing-card';
import { ListingQuestions } from '../../components/listing-questions/listing-questions';
import { ShareButton } from '../../components/share-button/share-button';
import { Checkout } from '../../components/checkout/checkout';

const SHARE_META_NAMES = [
  'og:title',
  'og:type',
  'og:url',
  'og:description',
  'og:image',
  'twitter:card',
  'twitter:image',
];

// Open Graph tags use `property`, Twitter tags use `name`.
const META_ATTRIBUTE = (tag: string) => (tag.startsWith('og:') ? 'property' : 'name');

@Component({
  imports: [RouterLink, FavouriteButton, ListingCard, ListingQuestions, ShareButton, Checkout],
  selector: 'app-listing-detail',
  styleUrl: './listing-detail.css',
  templateUrl: './listing-detail.html',
})
export class ListingDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private listingService = inject(ListingService);
  private supabase = inject(SUPABASE_CLIENT);
  private profileService = inject(Profile);
  private router = inject(Router);
  private location = inject(Location);
  private meta = inject(Meta);
  private titleService = inject(Title);

  listingId: string | null = null;

  listing = signal<Listing | null>(null);
  imageUrls = signal<string[]>([]);
  selectedImageIndex = signal(0);
  selectedImageUrl = computed(() => this.imageUrls()[this.selectedImageIndex()] ?? null);

  seller = signal<{ id: string; display_name: string } | null>(null);
  relatedListings = signal<Listing[]>([]);
  checkoutTestPending = signal(false);
  checkoutTestMessage = signal('');
  checkoutOpen = signal(false);

  readonly conditionLabels = LISTING_CONDITION_LABELS;
  readonly colorLabels = LISTING_COLOR_LABELS;

  shareUrl = computed(() => `${window.location.origin}/listings/${this.listing()?.id ?? ''}`);

  constructor() {
    const defaultTitle = this.titleService.getTitle();
    const defaultTags = SHARE_META_NAMES.map((name) => ({
      name,
      content: this.meta.getTag(`${META_ATTRIBUTE(name)}='${name}'`)?.content ?? null,
    }));

    // Describe the listing for browsers and crawlers that run JavaScript.
    effect(() => {
      const listing = this.listing();
      if (!listing) return;

      const title = listing.title ?? 'Listing on MEGURU';
      this.titleService.setTitle(`${title} | Meguru`);
      this.setTag('og:title', title);
      this.setTag('og:type', 'product');
      this.setTag('og:url', this.shareUrl());
      this.setTag('og:description', listing.description ?? `${title} on MEGURU`);
      this.setTag('og:image', this.selectedImageUrl());
      this.setTag('twitter:card', 'summary_large_image');
      this.setTag('twitter:image', this.selectedImageUrl());
    });

    inject(DestroyRef).onDestroy(() => {
      this.titleService.setTitle(defaultTitle);
      for (const { name, content } of defaultTags) {
        if (content === null) {
          this.meta.removeTag(`${META_ATTRIBUTE(name)}='${name}'`);
        } else {
          this.setTag(name, content);
        }
      }
    });
  }

  private setTag(name: string, content: string | null) {
    if (!content) return;

    this.meta.updateTag(
      { [META_ATTRIBUTE(name)]: name, content },
      `${META_ATTRIBUTE(name)}='${name}'`,
    );
  }

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.listingId = params.get('id');

      // Clear previous listing data when navigating to another listing.
      this.listing.set(null);
      this.seller.set(null);
      this.relatedListings.set([]);
      this.imageUrls.set([]);
      this.selectedImageIndex.set(0);
      this.checkoutTestMessage.set('');

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

  // Temporary test: verifies authenticated Angular -> Edge Function communication.
  // The Edge Function does not create a Stripe session or reservation yet.
  async testCheckoutConnection() {
    const listingId = this.listing()?.id;
    if (!listingId || this.checkoutTestPending()) return;

    this.checkoutTestPending.set(true);
    this.checkoutTestMessage.set('Testing connection...');

    try {
      const { data, error } = await this.supabase.functions.invoke('create-checkout-session', {
        body: { listingId },
      });

      if (listingId !== this.listingId) return;

      if (error) {
        console.error('Checkout function test failed:', error);
        this.checkoutTestMessage.set(`Connection failed: ${error.message}`);
        return;
      }

      console.log('Checkout function test response:', data);
      this.checkoutTestMessage.set(
        data?.message === 'Checkout request received'
          ? 'Connection successful!'
          : 'Function responded; check the console for details.',
      );
    } catch (error) {
      console.error('Unexpected checkout function error:', error);
      if (listingId === this.listingId) {
        this.checkoutTestMessage.set('Unexpected connection error. Check the console.');
      }
    } finally {
      this.checkoutTestPending.set(false);
    }
  }

  openCheckout() {
    this.checkoutOpen.set(true);
  }

  closeCheckout() {
    this.checkoutOpen.set(false);
  }

  goBack() {
    if (window.history.state?.fromMarketplace) {
      this.location.back();
    } else {
      void this.router.navigate(['/marketplace']);
    }
  }
  scrollToQuestions() {
    document.getElementById('listing-questions')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}
