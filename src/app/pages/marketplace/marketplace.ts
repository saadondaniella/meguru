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
import {
  Listing,
  ListingFilterValues,
  ListingCategory,
  ListingCondition,
  SIZE_OPTIONS,
} from '../../models/listing';
import { Profile } from '../../services/profile';
import { ListingCard } from '../../components/listing-card/listing-card';

@Component({
  selector: 'app-marketplace',
  imports: [RouterLink, ListingFilters, ListingCard],
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
  sort = signal<'newest' | 'oldest' | 'price_asc' | 'price_desc'>('newest');

  // Search and filters
  filters = signal<ListingFilterValues>({
    search: '',
    category: null,
    sizeType: null,
    size: null,
    minPrice: null,
    maxPrice: null,
    condition: null,
  });

  activeFilters = computed(() => {
    const filters = this.filters();

    const tags: {
      key: keyof ListingFilterValues;
      label: string;
    }[] = [];

    if (filters.search.trim()) {
      tags.push({
        key: 'search',
        label: `Search: ${filters.search.trim()}`,
      });
    }

    if (filters.category) {
      const labels = {
        exclusive: 'Exclusive',
        budget: 'Budget',
        free: 'Pass It On',
      };

      tags.push({
        key: 'category',
        label: labels[filters.category],
      });
    }

    if (filters.condition) {
      const labels = {
        new_with_tags: 'New with tags',
        like_new: 'Like new',
        very_good: 'Very good',
        good: 'Good',
        well_worn: 'Well worn',
      };

      tags.push({
        key: 'condition',
        label: labels[filters.condition],
      });
    }

    if (filters.sizeType) {
      const labels = {
        international: 'International',
        eu_clothing: 'EU Clothing',
        eu_shoes: 'EU Shoes',
      };

      tags.push({
        key: 'sizeType',
        label: labels[filters.sizeType],
      });
    }

    if (filters.size) {
      tags.push({
        key: 'size',
        label: `Size ${filters.size}`,
      });
    }

    if (filters.minPrice !== null || filters.maxPrice !== null) {
      const min = filters.minPrice ?? 0;
      const max = filters.maxPrice === null ? '10 000+' : filters.maxPrice;

      tags.push({
        key: 'minPrice',
        label: `${min}–${max} kr`,
      });
    }

    return tags;
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

    const categoryParam = params.get('category');
    const category: ListingCategory | null =
      categoryParam === 'exclusive' || categoryParam === 'budget' || categoryParam === 'free'
        ? categoryParam
        : null;

    const conditionParam = params.get('condition');
    const condition: ListingCondition | null =
      conditionParam === 'new_with_tags' ||
      conditionParam === 'like_new' ||
      conditionParam === 'very_good' ||
      conditionParam === 'good' ||
      conditionParam === 'well_worn'
        ? conditionParam
        : null;

    const parsePrice = (value: string | null): number | null => {
      if (value === null || value.trim() === '') return null;

      const price = Number(value);
      return Number.isFinite(price) && price >= 0 ? price : null;
    };

    const minPrice = parsePrice(params.get('minPrice'));
    const maxPrice = parsePrice(params.get('maxPrice'));

    this.filters.set({
      search: params.get('search') ?? '',
      category,
      sizeType,
      size,
      minPrice,
      maxPrice,
      condition,
    });

    // Restore current page
    const pageParam = Number(params.get('page'));
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    // Restore sorting from URL
    const sortParam = params.get('sort');

    if (sortParam === 'oldest' || sortParam === 'price_asc' || sortParam === 'price_desc') {
      this.sort.set(sortParam);
    }

    await Promise.all([this.loadPage(page), this.loadSellers()]);

    this.restoreMarketplacePosition();
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
        this.sort(),
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
        category: filters.category,
        sizeType: filters.sizeType,
        size: filters.sizeType ? filters.size : null,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        condition: filters.condition,
        page: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async changeSort(sort: 'newest' | 'oldest' | 'price_asc' | 'price_desc') {
    this.sort.set(sort);

    await this.loadPage(1);

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        sort: sort === 'newest' ? null : sort,
        page: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async removeFilter(field: keyof ListingFilterValues) {
    const updatedFilters = {
      ...this.filters(),
      [field]: field === 'search' ? '' : null,
    };

    if (field === 'sizeType') {
      updatedFilters.size = null;
    }

    if (field === 'minPrice' || field === 'maxPrice') {
      updatedFilters.minPrice = null;
      updatedFilters.maxPrice = null;
    }

    await this.applyFilters(updatedFilters);
  }

  async clearAllFilters() {
    await this.applyFilters({
      search: '',
      category: null,
      sizeType: null,
      size: null,
      minPrice: null,
      maxPrice: null,
      condition: null,
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
