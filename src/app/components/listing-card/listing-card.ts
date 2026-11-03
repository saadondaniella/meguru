import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { FavouriteButton } from '../favourite-button/favourite-button';

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

  // Emits the listing id when the user opens the listing.
  readonly opened = output<string>();

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }
}
