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
import { ListingFilters } from '../../components/listing-filters/listing-filters';
import { Listing, ListingFilterValues, SIZE_OPTIONS } from '../../models/listing';
import { Profile } from '../../services/profile';

@Component({
  selector: 'app-marketplace',
  imports: [RouterLink, ListingFilters],
  templateUrl: './marketplace.html',
  styleUrl: './marketplace.css',
})
export class Marketplace implements OnInit {
  private listingService = inject(ListingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private injector = inject(Injector);
  private profileService = inject(Profile);

  listings = signal<Listing[]>([]);
  currentPage = signal(1);
  pageSize = 9;
  totalListings = signal(0);
  isLoading = signal(false);
  sellers = signal<{ id: string; display_name: string }[]>([]);

  // Search and filters
  filters = signal<ListingFilterValues>({
    search: '',
    sizeType: null,
    size: null,
  });

  // Pagination
  totalPages = computed(() => Math.ceil(this.totalListings() / this.pageSize));

  pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;

    // Restore filters from URL
    const sizeTypeParam = params.get('sizeType');
    const sizeType =
      sizeTypeParam === 'international' ||
      sizeTypeParam === 'eu_clothing' ||
      sizeTypeParam === 'eu_shoes'
        ? sizeTypeParam
        : null;

    const sizeParam = params.get('size');
    const size =
      sizeType && sizeParam && SIZE_OPTIONS[sizeType].includes(sizeParam) ? sizeParam : null;

    this.filters.set({
      search: params.get('search') ?? '',
      sizeType,
      size,
    });

    // Restore current page
    const pageParam = Number(params.get('page'));
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    await Promise.all([this.loadPage(page), this.loadSellers()]);

    this.restoreMarketplacePosition();
  }

  getImageUrl(imagePath: string): string {
    return this.listingService.getListingImageUrl(imagePath);
  }

  async loadSellers() {
    const search = this.filters().search.trim();

    if (!search) {
      this.sellers.set([]);
      return;
    }

    const { data, error } = await this.profileService.searchProfiles(search);

    if (error) {
      console.error('Error searching sellers:', error);
      this.sellers.set([]);
      return;
    }

    this.sellers.set(data ?? []);
  }

  // Fetch listings with current filters
  async loadPage(page: number) {
    this.isLoading.set(true);

    try {
      const { data, error, count } = await this.listingService.getAllListings(
        page,
        this.pageSize,
        this.filters(),
      );

      if (error) {
        console.error('Error fetching listings:', error);
        return;
      }

      this.listings.set(data ?? []);
      this.totalListings.set(count ?? 0);
      this.currentPage.set(page);
    } finally {
      this.isLoading.set(false);
    }
  }

  async applyFilters(filters: ListingFilterValues) {
    this.filters.set(filters);

    await Promise.all([this.loadPage(1), this.loadSellers()]);

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: filters.search.trim() || null,
        brand: null,
        sizeType: filters.sizeType,
        size: filters.sizeType ? filters.size : null,
        page: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // Change pagination page
  async changePage(page: number) {
    if (page < 1 || page > this.totalPages()) return;

    await this.loadPage(page);

    if (this.currentPage() === page) {
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          page: page === 1 ? null : page,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });

      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  // Save listing position before navigating to detail
  saveScrollPosition(listingId: string) {
    sessionStorage.setItem('marketplaceReturnListingId', listingId);
  }

  // Restore listing position when returning
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
