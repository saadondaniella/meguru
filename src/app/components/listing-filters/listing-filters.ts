import { Component, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ListingFilterValues,
  ListingSizeType,
  ListingCategory,
  ListingCondition,
  SIZE_OPTIONS,
} from '../../models/listing';

const EMPTY_FILTERS: ListingFilterValues = {
  search: '',
  category: null,
  sizeType: null,
  size: null,
  minPrice: null,
  maxPrice: null,
  condition: null,
};

@Component({
  selector: 'app-listing-filters',
  imports: [FormsModule],
  templateUrl: './listing-filters.html',
  styleUrl: './listing-filters.css',
})
export class ListingFilters {
  filters = input.required<ListingFilterValues>();
  disabled = input(false);
  filtersChange = output<ListingFilterValues>();

  // Local draft so typing a brand does not emit until the form is submitted
  draft = linkedSignal(() => this.filters());

  readonly sizeOptions = SIZE_OPTIONS;
  readonly priceMin = 0;
  readonly priceMax = 10000;
  readonly priceStep = 100;

  filtersOpen = signal(false);

  totalResults = input(0);

  toggleFilters() {
    this.filtersOpen.update((open) => !open);
  }

  onSearchChange(search: string) {
    this.draft.update((draft) => ({ ...draft, search }));
  }

  onCategoryChange(category: ListingCategory | null) {
    this.draft.update((d) => ({ ...d, category }));
  }

  onSizeTypeChange(sizeType: ListingSizeType | null) {
    this.draft.update((d) => ({
      ...d,
      sizeType,
      size: null,
    }));
  }

  onConditionChange(condition: ListingCondition | null) {
    this.draft.update((d) => ({ ...d, condition }));
  }

  onSizeChange(size: string | null) {
    this.draft.update((d) => ({ ...d, size }));
  }

  onPriceChange(field: 'minPrice' | 'maxPrice', value: string) {
    const price = value.trim() === '' ? null : Number(value);

    this.draft.update((draft) => ({
      ...draft,
      [field]: price !== null && Number.isFinite(price) && price >= 0 ? price : null,
    }));
  }

  onPriceSliderChange(field: 'minPrice' | 'maxPrice', value: number) {
    const min = this.draft().minPrice ?? this.priceMin;
    const max = this.draft().maxPrice ?? this.priceMax;

    if (field === 'minPrice') {
      this.draft.update((draft) => ({
        ...draft,
        minPrice: Math.min(value, max),
      }));
    } else {
      this.draft.update((draft) => ({
        ...draft,
        maxPrice: value >= this.priceMax ? null : Math.max(value, min),
      }));
    }
  }

  submit() {
    this.filtersChange.emit(this.draft());
    this.filtersOpen.set(false);
  }

  reset() {
    this.draft.set(EMPTY_FILTERS);
  }
}
