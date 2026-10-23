import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-marketplace',
  imports: [RouterLink],
  templateUrl: './marketplace.html',
  styleUrl: './marketplace.css',
})
export class Marketplace implements OnInit {
  private listingService = inject(ListingService);

  listings = signal<Listing[]>([]);
  currentPage = signal(1);
  pageSize = 9;
  totalListings = signal(0);
  totalPages = computed(() => Math.ceil(this.totalListings() / this.pageSize));

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }

  async ngOnInit() {
    const { data, error, count } = await this.listingService.getAllListings(
      this.currentPage(),
      this.pageSize,
    );

    if (error) {
      console.error('Error fetching listings:', error);
      return;
    }

    this.listings.set(data ?? []);
    this.totalListings.set(count ?? 0);

    console.log('Marketplace listings:', this.listings());
  }

  async changePage(page: number) {
    if (page < 1 || page > this.totalPages()) return;

    const { data, error } = await this.listingService.getAllListings(page, this.pageSize);

    if (error) {
      console.error('Error changing marketplace page:', error);
      return;
    }

    this.listings.set(data ?? []);
    this.currentPage.set(page);
  }

  pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
}
