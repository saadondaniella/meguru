import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingFilterValues } from '../../models/listing';
import { ListingFilters } from './listing-filters';

describe('ListingFilters', () => {
  let fixture: ComponentFixture<ListingFilters>;
  let component: ListingFilters;
  let emitted: ListingFilterValues[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ListingFilters] }).compileComponents();

    fixture = TestBed.createComponent(ListingFilters);
    component = fixture.componentInstance;
    emitted = [];
    component.filtersChange.subscribe((value) => emitted.push(value));

    fixture.componentRef.setInput('filters', { brand: '', sizeType: null, size: null });
    await fixture.whenStable();
  });

  it('emits the typed brand only on submit', () => {
    component.onBrandChange('Acne');
    expect(emitted).toEqual([]);

    component.submit();
    expect(emitted).toEqual([{ brand: 'Acne', sizeType: null, size: null }]);
  });

  it('resets size and emits when the size type changes', () => {
    component.onSizeTypeChange('eu_shoes');
    component.onSizeChange('40');
    component.onSizeTypeChange('international');

    expect(emitted.at(-1)).toEqual({ brand: '', sizeType: 'international', size: null });
  });

  it('emits empty values on clear', () => {
    component.onBrandChange('Acne');
    component.onSizeTypeChange('eu_clothing');
    component.reset();

    expect(emitted.at(-1)).toEqual({ brand: '', sizeType: null, size: null });
  });

  it('disables the size select until a size type is chosen', async () => {
    const select = fixture.nativeElement.querySelector('#size') as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    fixture.componentRef.setInput('filters', { brand: '', sizeType: 'eu_shoes', size: null });
    await fixture.whenStable();

    expect(select.disabled).toBe(false);
  });
});
