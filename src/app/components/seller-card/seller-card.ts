import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// A seller as shown in search results and the seller directory.
export type SellerResult = {
  id: string;
  display_name: string;
  city: string | null;
  tagline: string | null;
  avatarUrl: string | null;
};

@Component({
  selector: 'app-seller-card',
  imports: [RouterLink],
  templateUrl: './seller-card.html',
  styleUrl: './seller-card.css',
})
export class SellerCard {
  seller = input.required<SellerResult>();
}
