import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { DEFAULT_STOREFRONT_STYLE, StorefrontStyle } from '../../models/storefront-theme';
import { SellerStorefront, StorefrontSeller } from './seller-storefront';

describe('SellerStorefront', () => {
  let fixture: ComponentFixture<SellerStorefront>;

  const el = () => fixture.nativeElement as HTMLElement;
  const wrapper = () => el().querySelector('.storefront') as HTMLElement;

  const seller: StorefrontSeller = {
    display_name: 'Daniella',
    tagline: 'A curated collection.',
    bio: 'I love secondhand fashion',
    city: 'Gothenburg',
    contact_email: 'hello@example.com',
    instagram: '@meguru',
    avatarUrl: null,
  };

  const listing = (id: string): Listing =>
    ({
      id,
      title: `Item ${id}`,
      price: 100,
      condition: 'good',
      image_path: null,
      status: 'published',
    }) as Listing;

  async function render(
    options: {
      seller?: Partial<StorefrontSeller>;
      style?: Partial<StorefrontStyle>;
      listings?: Listing[];
      isOwner?: boolean;
      preview?: boolean;
    } = {},
  ) {
    fixture = TestBed.createComponent(SellerStorefront);
    fixture.componentRef.setInput('seller', { ...seller, ...options.seller });
    fixture.componentRef.setInput('listings', options.listings ?? [listing('a'), listing('b')]);
    fixture.componentRef.setInput('style', { ...DEFAULT_STOREFRONT_STYLE, ...options.style });
    fixture.componentRef.setInput('isOwner', options.isOwner ?? false);
    fixture.componentRef.setInput('preview', options.preview ?? false);
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SellerStorefront],
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

  it('shows the name, tagline, city, bio and the wardrobe', async () => {
    await render();

    expect(el().querySelector('h1')?.textContent).toContain('Daniella');
    expect(el().querySelector('.seller-tagline')?.textContent).toContain('A curated collection.');
    expect(el().querySelector('.seller-city')?.textContent).toContain('Gothenburg');
    expect(el().querySelector('.seller-bio')?.textContent).toContain('secondhand');
    expect(el().querySelector('.seller-listings h2')?.textContent).toBe('THE WARDROBE');
    expect(el().querySelectorAll('app-listing-card')).toHaveLength(2);
  });

  it('omits the tagline when there is none', async () => {
    await render({ seller: { tagline: null } });

    expect(el().querySelector('.seller-tagline')).toBeNull();
  });

  it('shows the tagline as plain text, never as HTML', async () => {
    await render({ seller: { tagline: '<img src=x onerror=alert(1)>' } });

    expect(el().querySelector('.seller-tagline img')).toBeNull();
    expect(el().querySelector('.seller-tagline')?.textContent).toContain('<img');
  });

  it('shows the portrait, or the initial when there is no image', async () => {
    await render({ seller: { avatarUrl: 'https://example.com/a.jpg' } });

    expect(el().querySelector('.seller-portrait-image')?.getAttribute('src')).toBe(
      'https://example.com/a.jpg',
    );

    await render({ seller: { avatarUrl: null, display_name: 'zoe' } });

    const fallback = el().querySelector('.seller-portrait-fallback') as HTMLElement;

    expect(fallback.textContent?.trim()).toBe('z');
    expect(fallback.getAttribute('aria-hidden')).toBe('true');
    expect(el().querySelector('.seller-portrait-image')).toBeNull();
  });

  it('keeps the contact links and the empty state', async () => {
    await render({ listings: [] });

    const links = Array.from(el().querySelectorAll('.seller-contact a')).map((a) =>
      a.getAttribute('href'),
    );

    expect(links).toEqual(['mailto:hello@example.com', 'https://www.instagram.com/meguru']);
    expect(el().textContent).toContain("This seller hasn't listed any items yet.");
  });

  it('shows the edit link to the owner only', async () => {
    await render({ isOwner: true });
    expect(el().querySelector('.edit-profile-link')?.getAttribute('href')).toBe('/seller-profile');

    await render({ isOwner: false });
    expect(el().querySelector('.edit-profile-link')).toBeNull();
  });

  it('applies the default look through scoped custom properties', async () => {
    await render();

    expect(wrapper().style.getPropertyValue('--sf-bg')).toBe('#F5F2EB');
    expect(wrapper().style.getPropertyValue('--sf-text')).toBe('#4D5D46');
    expect(wrapper().style.getPropertyValue('--sf-name-weight')).toBe('500');
    expect(wrapper().style.getPropertyValue('--sf-image-radius')).toBe('0');
  });

  it('applies the chosen style', async () => {
    await render({
      style: {
        background: 'black',
        textColor: 'white',
        nameFont: 'noto_serif',
        nameWeight: 700,
        nameSize: 80,
        taglineStyle: 'italic',
        imageShape: 'circle',
      },
    });

    const css = (name: string) => wrapper().style.getPropertyValue(name);

    expect(css('--sf-bg')).toBe('#171717');
    expect(css('--sf-text')).toBe('#FFFFFF');
    expect(css('--sf-name-font')).toContain('Meguru Name Serif');
    expect(css('--sf-name-weight')).toBe('700');
    expect(css('--sf-name-size')).toContain('80px');
    expect(css('--sf-tagline-style')).toBe('italic');
    expect(css('--sf-image-radius')).toBe('50%');
    expect(css('--sf-image-ratio')).toBe('1 / 1');
  });

  it('does not leak the style outside its own wrapper', async () => {
    await render({ style: { background: 'black', textColor: 'white' } });

    expect(document.documentElement.style.getPropertyValue('--sf-bg')).toBe('');
    expect(document.body.style.getPropertyValue('--sf-bg')).toBe('');
  });

  describe('preview mode', () => {
    it('is inert and uses decorative hearts', async () => {
      await render({ preview: true });

      expect(el().hasAttribute('inert')).toBe(true);
      expect(el().querySelector('.storefront')?.classList).toContain('is-preview');
      expect(el().querySelectorAll('app-favourite-button')).toHaveLength(0);
      expect(el().querySelectorAll('.preview-heart')).toHaveLength(2);
    });

    it('is interactive when not a preview', async () => {
      await render({ preview: false });

      expect(el().hasAttribute('inert')).toBe(false);
      expect(el().querySelectorAll('app-favourite-button')).toHaveLength(2);
    });
  });
});
