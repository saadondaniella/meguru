import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Listing } from '../../models/listing';
import { StorefrontStyle, storefrontCssVars } from '../../models/storefront-theme';
import { ListingCard } from '../listing-card/listing-card';

export interface StorefrontSeller {
  display_name: string;
  tagline: string | null;
  bio: string | null;
  city: string | null;
  contact_email: string | null;
  instagram: string | null;
  avatarUrl: string | null;
}

// The public storefront. It is also used, in preview mode, by the style studio
// on the edit profile page, so both always look the same.
@Component({
  selector: 'app-seller-storefront',
  imports: [RouterLink, ListingCard],
  templateUrl: './seller-storefront.html',
  styleUrl: './seller-storefront.css',
  host: {
    // A preview is purely visual: no links, focus stops or screen reader noise.
    '[attr.inert]': "preview() ? '' : null",
  },
})
export class SellerStorefront {
  readonly seller = input.required<StorefrontSeller>();
  readonly listings = input.required<Listing[]>();
  readonly style = input.required<StorefrontStyle>();
  readonly isOwner = input(false);
  readonly preview = input(false);

  // Only constants from the theme model ever reach the stylesheet.
  readonly cssVars = computed(() => storefrontCssVars(this.style()));

  readonly initial = computed(() => this.seller().display_name.trim().charAt(0));

  readonly instagramUrl = computed(() => {
    const handle = this.seller().instagram?.replace('@', '');

    return handle ? `https://www.instagram.com/${handle}` : null;
  });
}
