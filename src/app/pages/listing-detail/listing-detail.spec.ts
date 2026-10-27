import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { ListingDetail } from './listing-detail';
import { ListingService } from '../../services/listing';
import { Profile } from '../../services/profile';

describe('ListingDetail', () => {
  let component: ListingDetail;
  let fixture: ComponentFixture<ListingDetail>;

  const listingServiceMock = {
    getListingById: vi.fn(),
    getListingImageUrl: vi.fn(),
    getListingImagePaths: vi.fn(),
  };

  const profileServiceMock = {
    getProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ListingDetail],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: () => 'test-listing-id',
              },
            },
          },
        },
        {
          provide: ListingService,
          useValue: listingServiceMock,
        },
        {
          provide: Profile,
          useValue: profileServiceMock,
        },
      ],
    }).compileComponents();

    listingServiceMock.getListingById.mockResolvedValue({
      data: null,
      error: { message: 'Listing not found' },
    });

    fixture = TestBed.createComponent(ListingDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows all images in a gallery and lets the user switch between them', async () => {
    listingServiceMock.getListingById.mockResolvedValue({
      data: { id: 'l1', seller_id: 's1', title: 'Jacket', image_path: 'a', status: 'published' },
      error: null,
    });
    listingServiceMock.getListingImagePaths.mockResolvedValue({
      data: ['a', 'b', 'c'],
      error: null,
    });
    listingServiceMock.getListingImageUrl.mockImplementation(
      (path: string) => `https://img/${path}`,
    );
    profileServiceMock.getProfile.mockResolvedValue({ data: null, error: null });

    await component.loadListing();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.gallery-thumbnail').length).toBe(3);
    expect(el.querySelector('.listing-image img')?.getAttribute('src')).toBe('https://img/a');
    expect(el.querySelector('.gallery-status')?.textContent).toContain('Image 1 of 3');

    (el.querySelectorAll('.gallery-thumbnail')[2] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('.listing-image img')?.getAttribute('src')).toBe('https://img/c');

    // Next wraps around to the first image; ArrowLeft goes back.
    (el.querySelectorAll('.gallery-step')[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(component.selectedImageIndex()).toBe(0);

    el.querySelector('.listing-gallery')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    await fixture.whenStable();
    expect(component.selectedImageIndex()).toBe(2);
  });
});
