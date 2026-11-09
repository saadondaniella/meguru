import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ListingDetail } from './listing-detail';
import { ListingService } from '../../services/listing';
import { ListingQuestionsService } from '../../services/listing-questions';
import { Profile } from '../../services/profile';

describe('ListingDetail', () => {
  let component: ListingDetail;
  let fixture: ComponentFixture<ListingDetail>;

  const listingServiceMock = {
    getListingById: vi.fn(),
    getListingImageUrl: vi.fn(),
    getListingImagePaths: vi.fn(),
    getRelatedListings: vi.fn(),
  };

  const profileServiceMock = {
    getProfile: vi.fn(),
  };

  const listingQuestionsServiceMock = {
    getQuestions: vi.fn(),
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
            paramMap: of(convertToParamMap({ id: 'test-listing-id' })),
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
        {
          provide: ListingQuestionsService,
          useValue: listingQuestionsServiceMock,
        },
      ],
    }).compileComponents();

    listingQuestionsServiceMock.getQuestions.mockResolvedValue({
      data: { questions: [], total: 0 },
      error: null,
    });

    listingServiceMock.getListingById.mockResolvedValue({
      data: null,
      error: { message: 'Listing not found' },
    });

    listingServiceMock.getRelatedListings.mockResolvedValue({ data: [], error: null });

    fixture = TestBed.createComponent(ListingDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows all images in a gallery and lets the user switch between them', async () => {
    listingServiceMock.getListingById.mockResolvedValue({
      data: {
        id: 'test-listing-id',
        seller_id: 's1',
        title: 'Jacket',
        image_path: 'a',
        status: 'published',
      },
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

  describe('Ask the Seller section', () => {
    const showListing = async (status: 'draft' | 'published' | 'sold') => {
      listingServiceMock.getListingById.mockResolvedValue({
        data: { id: 'test-listing-id', seller_id: 's1', title: 'Jacket', image_path: null, status },
        error: null,
      });
      listingServiceMock.getListingImagePaths.mockResolvedValue({ data: [], error: null });
      listingServiceMock.getListingImageUrl.mockReturnValue('');
      listingServiceMock.getRelatedListings.mockResolvedValue({
        data: [{ id: 'r1', seller_id: 's2', title: 'Related', status: 'published' }],
        error: null,
      });
      profileServiceMock.getProfile.mockResolvedValue({ data: null, error: null });

      await component.loadListing();
      await fixture.whenStable();

      return fixture.nativeElement as HTMLElement;
    };

    it('is shown for a published listing, between the product details and related products', async () => {
      const el = await showListing('published');

      const questions = el.querySelector('app-listing-questions');
      const related = el.querySelector('.recommendations');

      expect(questions).not.toBeNull();
      expect(questions!.querySelector('h2')?.textContent).toContain('ASK THE SELLER');
      expect(related).not.toBeNull();

      // Questions come after the two-column content and before related products.
      expect(
        el.querySelector('.listing-content')!.compareDocumentPosition(questions!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        questions!.compareDocumentPosition(related!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(listingQuestionsServiceMock.getQuestions).toHaveBeenCalledWith(
        'test-listing-id',
        3,
        0,
      );
    });

    it('is shown for a sold listing', async () => {
      const el = await showListing('sold');

      expect(el.querySelector('app-listing-questions')).not.toBeNull();
    });

    it('is not shown, and nothing is requested, for a draft listing', async () => {
      const el = await showListing('draft');

      expect(el.querySelector('app-listing-questions')).toBeNull();
      expect(listingQuestionsServiceMock.getQuestions).not.toHaveBeenCalled();
    });
  });
});
