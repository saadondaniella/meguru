import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Marketplace } from './marketplace';
import { ListingService } from '../../services/listing';
import { Profile } from '../../services/profile';

describe('Marketplace seller results', () => {
  let fixture: ComponentFixture<Marketplace>;

  const searchProfiles = vi.fn();
  const getAllListings = vi.fn();

  async function create(search: string) {
    await TestBed.configureTestingModule({
      imports: [Marketplace],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ search }) } },
        },
        {
          provide: ListingService,
          useValue: { getAllListings, getListingImageUrl: vi.fn(() => null) },
        },
        {
          provide: Profile,
          useValue: {
            searchProfiles,
            getAvatarUrl: vi.fn((path: string | null) =>
              path ? `https://example.com/avatars/${path}` : null,
            ),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Marketplace);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
  }

  beforeEach(() => {
    searchProfiles.mockReset();
    getAllListings.mockReset();
    getAllListings.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('shows each seller as a link to their storefront with avatar, city and tagline', async () => {
    searchProfiles.mockResolvedValue({
      data: [
        {
          id: 's1',
          display_name: 'Daniella',
          city: 'Gothenburg',
          tagline: 'Worth keeping.',
          avatar_path: 's1/a.png',
        },
        { id: 's2', display_name: 'Dana', city: null, tagline: null, avatar_path: null },
      ],
      error: null,
    });

    await create('da');

    const cards = fixture.nativeElement.querySelectorAll(
      'a.seller-card',
    ) as NodeListOf<HTMLElement>;

    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('href')).toBe('/sellers/s1');
    expect(cards[0].textContent).toContain('Gothenburg');
    expect(cards[0].textContent).toContain('Worth keeping.');
    expect(cards[0].querySelector('img')?.getAttribute('alt')).toBe('');
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/avatars/s1/a.png',
    );
  });

  it('handles a seller without avatar, city or tagline', async () => {
    searchProfiles.mockResolvedValue({
      data: [{ id: 's2', display_name: 'Dana', city: null, tagline: '  ', avatar_path: null }],
      error: null,
    });

    await create('dana');

    const card = fixture.nativeElement.querySelector('a.seller-card') as HTMLElement;

    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.seller-card-avatar')?.textContent?.trim()).toBe('D');
    expect(card.querySelector('.seller-card-city')).toBeNull();
    expect(card.querySelector('.seller-card-tagline')).toBeNull();
  });

  it('shows no seller section without a search', async () => {
    await create('');

    expect(searchProfiles).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.marketplace-sellers')).toBeNull();
  });
});
