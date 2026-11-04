import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingFilterValues } from '../../models/listing';
import { ListingFilters } from './listing-filters';

describe('ListingFilters', () => {
  let fixture: ComponentFixture<ListingFilters>;
  let component: ListingFilters;
  let emitted: ListingFilterValues[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListingFilters],
    }).compileComponents();

    fixture = TestBed.createComponent(ListingFilters);
    component = fixture.componentInstance;
    emitted = [];

    component.filtersChange.subscribe((value) => emitted.push(value));

    fixture.componentRef.setInput('filters', {
      search: '',
      sizeType: null,
      size: null,
    });

    await fixture.whenStable();
  });

  it('emits the typed search only on submit', () => {
    component.onSearchChange('Acne');
    expect(emitted).toEqual([]);

    component.submit();

    expect(emitted).toEqual([
      {
        search: 'Acne',
        sizeType: null,
        size: null,
      },
    ]);
  });

  it('offers all colors and emits the chosen one on submit', () => {
    const options = Array.from(
      (fixture.nativeElement.querySelector('#color') as HTMLSelectElement).options,
    ).map((option) => option.textContent?.trim());

    expect(options[0]).toBe('All colors');
    expect(options).toHaveLength(14);

    component.onColorChange('blue');
    component.submit();

    expect(emitted.at(-1)).toEqual(expect.objectContaining({ color: 'blue' }));
  });

  it('resets the size when the size type changes, and emits on submit', () => {
    component.onSizeTypeChange('eu_shoes');
    component.onSizeChange('40');
    component.onSizeTypeChange('international');
    expect(emitted).toEqual([]);

    component.submit();

    expect(emitted.at(-1)).toEqual({
      search: '',
      sizeType: 'international',
      size: null,
    });
  });

  it('emits empty values when cleared and submitted', () => {
    component.onSearchChange('Acne');
    component.onSizeTypeChange('eu_clothing');
    component.reset();
    expect(emitted).toEqual([]);

    component.submit();

    expect(emitted.at(-1)).toEqual({
      search: '',
      category: null,
      sizeType: null,
      size: null,
      minPrice: null,
      maxPrice: null,
      condition: null,
      color: null,
    });
  });

  it('disables the size select until a size type is chosen', async () => {
    const select = fixture.nativeElement.querySelector('#size') as HTMLSelectElement;

    expect(select.disabled).toBe(true);

    fixture.componentRef.setInput('filters', {
      search: '',
      sizeType: 'eu_shoes',
      size: null,
    });

    await fixture.whenStable();

    expect(select.disabled).toBe(false);
  });
});
