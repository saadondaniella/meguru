import { Component, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ListingFilterValues, ListingSizeType, SIZE_OPTIONS } from '../../models/listing';

const EMPTY_FILTERS: ListingFilterValues = { brand: '', sizeType: null, size: null };

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

  onBrandChange(brand: string) {
    this.draft.update((draft) => ({ ...draft, brand }));
  }

  // Reset size when changing size system
  onSizeTypeChange(sizeType: ListingSizeType | null) {
    this.draft.update((draft) => ({ ...draft, sizeType, size: null }));
    this.submit();
  }

  onSizeChange(size: string | null) {
    this.draft.update((draft) => ({ ...draft, size }));
    this.submit();
  }

  submit() {
    this.filtersChange.emit(this.draft());
  }

  reset() {
    this.draft.set(EMPTY_FILTERS);
    this.submit();
  }
}
