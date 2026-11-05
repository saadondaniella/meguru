import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingService } from '../../services/listing';
import { Profile } from '../../services/profile';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { PublicSellerProfile } from './public-seller-profile';

describe('PublicSellerProfile', () => {
  let fixture: ComponentFixture<PublicSellerProfile>;

  const el = () => fixture.nativeElement as HTMLElement;
  const wrapper = () => el().querySelector('.storefront') as HTMLElement;
  const css = (name: string) => wrapper().style.getPropertyValue(name);

  const getProfile = vi.fn();

  async function render(profile: Record<string, unknown>) {
    getProfile.mockResolvedValue({
      data: {
        id: 's1',
        display_name: 'Daniella',
        bio: null,
        city: null,
        avatar_path: null,
        contact_email: null,
        instagram: null,
        ...profile,
      },
      error: null,
    });

    fixture = TestBed.createComponent(PublicSellerProfile);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    getProfile.mockReset();

    TestBed.configureTestingModule({
      imports: [PublicSellerProfile],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 's1' }) } },
        },
        {
          provide: Profile,
          useValue: { getProfile, getAvatarUrl: (path: string | null) => path },
        },
        {
          provide: ListingService,
          useValue: {
            getPublishedListingsBySeller: vi.fn(async () => ({ data: [], error: null })),
            getListingImageUrl: (p: string) => p,
          },
        },
        {
          provide: SUPABASE_CLIENT,
          useValue: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } },
        },
        {
          provide: FavouriteService,
          useValue: {
            favouriteIds: signal(new Set<string>()),
            counts: signal(new Map<string, number>()),
            loadCount: vi.fn(async () => ({ error: null })),
          },
        },
        { provide: Auth, useValue: { isLoggedIn: signal(false) } },
      ],
    });
  });

  it('renders a legacy profile with the default look and no tagline', async () => {
    await render({});

    expect(el().querySelector('h1')?.textContent).toContain('Daniella');
    expect(el().querySelector('.seller-tagline')).toBeNull();
    expect(css('--sf-bg')).toBe('#F5F2EB');
    expect(css('--sf-text')).toBe('#4D5D46');
    expect(css('--sf-name-size')).toBe('clamp(3.5rem, 8cqi, 8rem)');
    expect(css('--sf-image-radius')).toBe('0');
    expect(el().hasAttribute('inert')).toBe(false);
  });

  it('renders the saved tagline and customization', async () => {
    await render({
      tagline: 'Things worth keeping.',
      storefront_background: 'sage',
      storefront_text_color: 'black',
      storefront_image_shape: 'soft',
      storefront_tagline_style: 'italic',
    });

    expect(el().querySelector('.seller-tagline')?.textContent).toContain('Things worth keeping.');
    expect(css('--sf-bg')).toBe('#C9D0BF');
    expect(css('--sf-text')).toBe('#171717');
    expect(css('--sf-image-radius')).toBe('24px');
    expect(css('--sf-tagline-style')).toBe('italic');
  });

  it('falls back to the defaults for unknown stored values', async () => {
    await render({ storefront_background: 'hotpink', storefront_image_shape: 'star' });

    expect(css('--sf-bg')).toBe('#F5F2EB');
    expect(css('--sf-image-radius')).toBe('0');
  });

  it('shows a loading message until the profile is available', async () => {
    getProfile.mockResolvedValue({ data: null, error: { message: 'x' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fixture = TestBed.createComponent(PublicSellerProfile);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().textContent).toContain('Loading seller profile...');
  });
});
