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
});
