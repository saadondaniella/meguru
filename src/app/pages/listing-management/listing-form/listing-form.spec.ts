import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingService } from '../../../services/listing';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { Listing } from '../../../models/listing';
import { ListingForm } from './listing-form';

describe('ListingForm color', () => {
  let fixture: ComponentFixture<ListingForm>;
  let component: ListingForm;
  let service: {
    createListing: ReturnType<typeof vi.fn>;
    updateListing: ReturnType<typeof vi.fn>;
    saveListingImages: ReturnType<typeof vi.fn>;
    getListingImagePaths: ReturnType<typeof vi.fn>;
    getListingImageUrl: ReturnType<typeof vi.fn>;
  };

  const select = () => fixture.nativeElement.querySelector('#color') as HTMLSelectElement;

  async function render(listing: Listing | null = null) {
    fixture = TestBed.createComponent(ListingForm);
    fixture.componentRef.setInput('listing', listing);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  function fillRequiredFields() {
    component.listingForm.patchValue({ title: 'Linen shirt', price: 200 });
  }

  const existing = (overrides: Partial<Listing>): Listing => ({
    id: 'l1',
    seller_id: 'u1',
    title: 'Old shirt',
    description: null,
    price: 100,
    category: 'budget',
    condition: 'good',
    image_path: null,
    created_at: '2026-01-01',
    status: 'published',
    brand: null,
    size_type: null,
    size: null,
    color: null,
    ...overrides,
  });

  beforeEach(() => {
    service = {
      createListing: vi.fn(async (fields: object) => ({
        data: { id: 'new', ...fields },
        error: null,
      })),
      updateListing: vi.fn(async () => ({ error: null })),
      saveListingImages: vi.fn(async () => ({ error: null })),
      getListingImagePaths: vi.fn(async () => ({ data: [], error: null })),
      getListingImageUrl: vi.fn((path: string) => path),
    };

    TestBed.configureTestingModule({
      imports: [ListingForm],
      providers: [
        { provide: ListingService, useValue: service },
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
          },
        },
      ],
    });
  });

  it('lists the 13 colors in order after a disabled placeholder', async () => {
    await render();

    const options = Array.from(select().options).map((option) => option.textContent?.trim());

    expect(options).toEqual([
      'Select a color',
      'Black',
      'White',
      'Grey',
      'Brown',
      'Beige',
      'Blue',
      'Green',
      'Red',
      'Pink',
      'Yellow',
      'Purple',
      'Orange',
      'Multicolour',
    ]);
    expect(select().options[0].disabled).toBe(true);
  });

  it('does not publish without a color and shows an accessible error', async () => {
    await render();
    fillRequiredFields();

    await component.onSubmit();
    await fixture.whenStable();

    expect(service.createListing).not.toHaveBeenCalled();
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('#color-error')).not.toBeNull();
  });

  it('publishes with the selected color', async () => {
    await render();
    fillRequiredFields();
    component.listingForm.controls.color.setValue('multicolour');

    await component.onSubmit();

    expect(service.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'multicolour', status: 'published' }),
    );
  });

  it('saves a draft without a color as null', async () => {
    await render();
    component.listingForm.patchValue({ title: 'Draft shirt' });

    await component.onSaveDraft();

    expect(service.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ color: null, status: 'draft' }),
    );
  });

  it('requires a color when saving changes to a published listing without one', async () => {
    await render(existing({ color: null }));

    await component.onSubmit();

    expect(service.updateListing).not.toHaveBeenCalled();
  });

  it('keeps an existing color when saving changes to a published listing', async () => {
    await render(existing({ color: 'blue' }));

    expect(select().value).toBe('blue');

    await component.onSubmit();

    expect(service.updateListing).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({ color: 'blue' }),
    );
  });
});
