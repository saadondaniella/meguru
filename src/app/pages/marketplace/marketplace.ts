import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  afterNextRender,
  Injector,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';

@Component({
  selector: 'app-marketplace',
  imports: [RouterLink],
  templateUrl: './marketplace.html',
  styleUrl: './marketplace.css',
})
export class Marketplace implements OnInit {
  private listingService = inject(ListingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private injector = inject(Injector);

  listings = signal<Listing[]>([]);
  currentPage = signal(1);
  pageSize = 9;
  totalListings = signal(0);

  totalPages = computed(() => Math.ceil(this.totalListings() / this.pageSize));

  pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  async ngOnInit() {
    const pageParam = Number(this.route.snapshot.queryParamMap.get('page'));
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    await this.loadPage(page);

    this.restoreMarketplacePosition();
  }

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }

  async loadPage(page: number) {
    const { data, error, count } = await this.listingService.getAllListings(page, this.pageSize);

    if (error) {
      console.error('Error fetching listings:', error);
      return;
    }

    this.listings.set(data ?? []);
    this.totalListings.set(count ?? 0);
    this.currentPage.set(page);
  }

  async changePage(page: number) {
    if (page < 1 || page > this.totalPages()) return;

    await this.loadPage(page);

    if (this.currentPage() === page) {
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: page === 1 ? null : page },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });

      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  saveScrollPosition(listingId: string) {
    sessionStorage.setItem('marketplaceReturnListingId', listingId);
  }

  private restoreMarketplacePosition() {
    const listingId = sessionStorage.getItem('marketplaceReturnListingId');

    if (!listingId) return;

    afterNextRender(
      {
        read: () => {
          const cards = document.querySelectorAll<HTMLElement>('[data-listing-id]');

          const card = Array.from(cards).find(
            (element) => element.dataset['listingId'] === listingId,
          );

          if (card) {
            card.scrollIntoView({
              behavior: 'instant',
              block: 'center',
            });

            sessionStorage.removeItem('marketplaceReturnListingId');
          }
        },
      },
      { injector: this.injector },
    );
  }
}
