import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { FavouriteButton } from '../favourite-button/favourite-button';
import { LISTING_CONDITION_LABELS } from '../../models/listing';

@Component({
  selector: 'app-listing-card',
  imports: [RouterLink, FavouriteButton],
  templateUrl: './listing-card.html',
  styleUrl: './listing-card.css',
  host: {
    '[attr.data-listing-id]': 'listing().id',
  },
})
export class ListingCard {
  private listingService = inject(ListingService);

  readonly listing = input.required<Listing>();
  readonly headingLevel = input<2 | 3>(2);
  readonly fromMarketplace = input(false);

  // Static, non-interactive rendering used by the storefront preview:
  // no favourite button (so no RPC calls) and a decorative heart instead.
  readonly preview = input(false);
  readonly conditionLabels = LISTING_CONDITION_LABELS;

  // Emits the listing id when the user opens the listing.
  readonly opened = output<string>();

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }
}
