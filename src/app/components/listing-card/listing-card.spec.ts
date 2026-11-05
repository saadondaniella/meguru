import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { ListingCard } from './listing-card';

describe('ListingCard', () => {
  let fixture: ComponentFixture<ListingCard>;

  const el = () => fixture.nativeElement as HTMLElement;

  async function render(overrides: Partial<Listing> = {}, headingLevel: 2 | 3 = 2) {
    fixture = TestBed.createComponent(ListingCard);
    fixture.componentRef.setInput('listing', {
      id: 'l1',
      title: 'Wool coat',
      price: 250,
      condition: 'good',
      image_path: 'a.jpg',
      status: 'published',
      ...overrides,
    } as Listing);
    fixture.componentRef.setInput('headingLevel', headingLevel);
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ListingCard],
      providers: [
        provideRouter([]),
        { provide: ListingService, useValue: { getListingImageUrl: (p: string) => `/img/${p}` } },
        {
          provide: FavouriteService,
          useValue: {
            favouriteIds: signal(new Set<string>()),
            counts: signal(new Map<string, number>()),
            loadCount: vi.fn(async () => ({ error: null })),
          },
        },
        { provide: Auth, useValue: { isLoggedIn: signal(true) } },
      ],
    });
  });

  it('renders title, price, image and link to the listing', async () => {
    await render();

    expect(el().querySelector('h2')?.textContent).toContain('Wool coat');
    expect(el().textContent).toContain('250 kr');
    expect(el().querySelector('img')?.getAttribute('src')).toBe('/img/a.jpg');
    expect(el().querySelector('a')?.getAttribute('href')).toBe('/listings/l1');
    expect(el().getAttribute('data-listing-id')).toBe('l1');
  });

  it('uses the requested heading level', async () => {
    await render({}, 3);

    expect(el().querySelector('h3')).not.toBeNull();
    expect(el().querySelector('h2')).toBeNull();
  });

  it('shows the sold badge only for sold listings', async () => {
    await render({ status: 'sold' });
    expect(el().querySelector('.sold-badge')).not.toBeNull();

    await render({ status: 'published' });
    expect(el().querySelector('.sold-badge')).toBeNull();
  });

  it('emits the listing id when opened', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await render();
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);

    el().querySelector('a')?.click();

    expect(opened).toHaveBeenCalledWith('l1');
  });
  describe('preview mode', () => {
    let loadCount: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      loadCount = vi.fn(async () => ({ error: null }));
      TestBed.overrideProvider(FavouriteService, {
        useValue: {
          favouriteIds: signal(new Set<string>()),
          counts: signal(new Map<string, number>()),
          loadCount,
        },
      });
    });

    it('shows a decorative heart and makes no favourite calls', async () => {
      fixture = TestBed.createComponent(ListingCard);
      fixture.componentRef.setInput('listing', {
        id: 'p1',
        title: 'Sample',
        price: 100,
        image_path: null,
        status: 'published',
      } as Listing);
      fixture.componentRef.setInput('preview', true);
      await fixture.whenStable();

      expect(el().querySelector('app-favourite-button')).toBeNull();
      expect(el().querySelector('.preview-heart')?.getAttribute('aria-hidden')).toBe('true');
      expect(el().querySelector('.preview-image')).not.toBeNull();
      expect(loadCount).not.toHaveBeenCalled();
    });

    it('keeps the normal favourite button outside preview mode', async () => {
      await render();

      expect(el().querySelector('app-favourite-button')).not.toBeNull();
      expect(el().querySelector('.preview-heart')).toBeNull();
      expect(el().querySelector('.preview-image')).toBeNull();
    });
  });
});
