import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SellerProfile } from './seller-profile';
import { Profile } from '../../services/profile';
import { ListingService } from '../../services/listing';
import { DEFAULT_STOREFRONT_STYLE } from '../../models/storefront-theme';
import { SUPABASE_CLIENT } from '../../services/supabase';

describe('SellerProfile', () => {
  let component: SellerProfile;
  let fixture: ComponentFixture<SellerProfile>;

  const mockGetUser = vi.fn();
  const mockGetProfile = vi.fn();
  const mockUpdateProfile = vi.fn();
  const mockCreateProfile = vi.fn();
  const mockGetPublishedListingsBySeller = vi.fn();

  const defaultStyleColumns = {
    storefront_background: 'ivory',
    storefront_text_color: 'olive',
    storefront_name_font: 'plus_jakarta_sans',
    storefront_name_weight: 500,
    storefront_name_size: null,
    storefront_tagline_style: 'regular',
    storefront_image_shape: 'classic',
    storefront_listing_order: 'newest',
  };

  beforeEach(async () => {
    mockGetUser.mockReset();
    mockGetProfile.mockReset();
    mockUpdateProfile.mockReset();
    mockCreateProfile.mockReset();
    mockGetPublishedListingsBySeller.mockReset();
    mockGetPublishedListingsBySeller.mockResolvedValue({ data: [], error: null });

    // Mock an authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null,
    });

    // Mock an existing seller profile
    mockGetProfile.mockResolvedValue({
      data: {
        id: 'test-user-123',
        display_name: 'Daniella',
        bio: 'I love secondhand fashion',
        city: 'Gothenburg',
        contact_email: 'test@example.com',
        instagram: '@meguru',
      },
      error: null,
    });

    // Mock a successful profile update
    mockUpdateProfile.mockResolvedValue({
      data: { id: 'test-user-123' },
      error: null,
    });

    // Mock a successful profile creation
    mockCreateProfile.mockResolvedValue({
      data: null,
      error: null,
    });

    await TestBed.configureTestingModule({
      imports: [SellerProfile],
      providers: [
        provideRouter([]),
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            auth: {
              getUser: mockGetUser,
            },
          },
        },
        {
          provide: ListingService,
          useValue: {
            getPublishedListingsBySeller: mockGetPublishedListingsBySeller,
            getListingImageUrl: vi.fn((path: string) => `https://example.com/${path}`),
          },
        },
        {
          provide: Profile,
          useValue: {
            getProfile: mockGetProfile,
            updateProfile: mockUpdateProfile,
            createProfile: mockCreateProfile,
            getAvatarUrl: vi.fn((path: string | null) =>
              path ? `https://example.com/avatars/${path}` : null,
            ),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerProfile);
    component = fixture.componentInstance;

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load an existing seller profile into the form', () => {
    expect(mockGetProfile).toHaveBeenCalledWith('test-user-123');
    expect(component.hasProfile()).toBe(true);

    expect(component.profileForm.value).toEqual({
      display_name: 'Daniella',
      bio: 'I love secondhand fashion',
      city: 'Gothenburg',
      contact_email: 'test@example.com',
      instagram: '@meguru',
      tagline: '',
    });
  });

  it('links back to the public profile of the logged-in seller', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.back-to-profile') as HTMLAnchorElement;

    expect(link.textContent).toContain('BACK TO MY PROFILE');
    expect(link.getAttribute('href')).toBe('/sellers/test-user-123');
  });

  it('hides the back link until the seller has a profile', async () => {
    mockGetProfile.mockResolvedValue({ data: null, error: null });

    await component.loadProfile();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.back-to-profile')).toBeNull();
  });

  it('offers a link to the public profile after a successful save', async () => {
    await component.onSubmit();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.view-profile-link') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/sellers/test-user-123');
    expect(fixture.nativeElement.querySelector('.success-message')?.textContent).toContain(
      'Your profile has been saved!',
    );
  });

  it('should show an error when loading the profile fails', async () => {
    mockGetProfile.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    await component.loadProfile();
    fixture.detectChanges();

    expect(component.loadError()).toBe(true);
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Could not load your profile. Please try again.');
  });

  it('should update an existing seller profile', async () => {
    component.profileForm.patchValue({
      display_name: '  Daniella Saadon  ',
      bio: 'Updated bio',
      city: 'Stockholm',
    });

    await component.onSubmit();

    expect(mockUpdateProfile).toHaveBeenCalledWith('test-user-123', {
      display_name: 'Daniella Saadon',
      bio: 'Updated bio',
      city: 'Stockholm',
      contact_email: 'test@example.com',
      instagram: '@meguru',
      tagline: null,
      ...defaultStyleColumns,
    });

    expect(component.successMessage()).toBe('Your profile has been saved!');
    expect(component.isSaving()).toBe(false);
  });

  it('should show an error when saving the profile fails', async () => {
    mockUpdateProfile.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    await component.onSubmit();

    expect(mockUpdateProfile).toHaveBeenCalled();

    expect(component.errorMessage()).toBe('Could not save your profile. Please try again.');
    expect(component.successMessage()).toBe('');
    expect(component.isSaving()).toBe(false);
  });

  it('should create a new seller profile', async () => {
    // Simulate a user who has no profile yet
    mockGetProfile.mockResolvedValue({
      data: null,
      error: null,
    });

    // Reset the previously loaded profile state
    component.hasProfile.set(false);
    component.profileForm.reset();

    await component.loadProfile();

    expect(component.hasProfile()).toBe(false);

    component.profileForm.patchValue({
      display_name: 'New Seller',
      bio: 'Hello MEGURU!',
      city: 'Gothenburg',
      contact_email: '',
      instagram: '',
    });

    await component.onSubmit();

    expect(mockCreateProfile).toHaveBeenCalledWith({
      display_name: 'New Seller',
      bio: 'Hello MEGURU!',
      city: 'Gothenburg',
      contact_email: null,
      instagram: null,
      tagline: null,
      ...defaultStyleColumns,
    });

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(component.hasProfile()).toBe(true);
    expect(component.successMessage()).toBe('Your profile has been saved!');
  });

  it('should not save a profile with a whitespace-only display name', async () => {
    component.profileForm.patchValue({
      display_name: '     ',
    });

    await component.onSubmit();

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Please correct the highlighted fields.');
  });

  it('should reset hasProfile when no profile is found', async () => {
    expect(component.hasProfile()).toBe(true);

    mockGetProfile.mockResolvedValue({
      data: null,
      error: null,
    });

    await component.loadProfile();

    expect(component.hasProfile()).toBe(false);
    expect(component.loadError()).toBe(false);
    expect(component.isLoading()).toBe(false);
  });
  describe('storefront customization', () => {
    const previewText = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    async function loadWith(extra: Record<string, unknown>) {
      mockGetProfile.mockResolvedValue({
        data: {
          id: 'test-user-123',
          display_name: 'Daniella',
          bio: null,
          city: null,
          contact_email: null,
          instagram: null,
          avatar_path: null,
          ...extra,
        },
        error: null,
      });

      await component.loadProfile();
      fixture.detectChanges();
    }

    it('uses the default style for a legacy profile', () => {
      expect(component.style()).toEqual(DEFAULT_STOREFRONT_STYLE);
    });

    it('loads the saved tagline and style', async () => {
      await loadWith({
        tagline: 'Things worth keeping.',
        storefront_background: 'black',
        storefront_text_color: 'cream',
        storefront_name_size: 90,
        storefront_tagline_style: 'italic',
        storefront_image_shape: 'circle',
      });

      expect(component.profileForm.controls.tagline.value).toBe('Things worth keeping.');
      expect(component.style()).toMatchObject({
        background: 'black',
        textColor: 'cream',
        nameSize: 90,
        taglineStyle: 'italic',
        imageShape: 'circle',
      });
    });

    it('saves the tagline and the chosen style with the profile', async () => {
      component.profileForm.patchValue({ tagline: '  Slow fashion.  ' });
      component.style.set({
        ...DEFAULT_STOREFRONT_STYLE,
        background: 'black',
        textColor: 'white',
        nameFont: 'noto_serif',
        nameWeight: 700,
        nameSize: 72,
        taglineStyle: 'italic',
        imageShape: 'soft',
        listingOrder: 'brand_asc',
      });

      await component.onSubmit();

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({
          tagline: 'Slow fashion.',
          storefront_background: 'black',
          storefront_text_color: 'white',
          storefront_name_font: 'noto_serif',
          storefront_name_weight: 700,
          storefront_name_size: 72,
          storefront_tagline_style: 'italic',
          storefront_image_shape: 'soft',
          storefront_listing_order: 'brand_asc',
        }),
      );
    });

    it('does not save an unreadable colour pair', async () => {
      component.style.set({ ...DEFAULT_STOREFRONT_STYLE, background: 'black', textColor: 'olive' });

      await component.onSubmit();

      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe('Please choose a text color with enough contrast.');
    });

    it('stores an empty tagline as null', async () => {
      component.profileForm.patchValue({ tagline: '   ' });

      await component.onSubmit();

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ tagline: null }),
      );
    });

    it('limits the tagline to 80 characters on a single line', () => {
      const control = component.profileForm.controls.tagline;

      control.setValue('a'.repeat(80));
      expect(control.valid).toBe(true);

      control.setValue('a'.repeat(81));
      expect(control.hasError('maxlength')).toBe(true);

      control.setValue('two\nlines');
      expect(control.hasError('pattern')).toBe(true);
    });

    it('shows the typed name and tagline in the preview before saving', async () => {
      component.profileForm.patchValue({ display_name: 'Preview Name', tagline: 'Live tagline' });
      fixture.detectChanges();

      const preview = fixture.nativeElement.querySelector('app-seller-storefront') as HTMLElement;

      expect(preview.textContent).toContain('Preview Name');
      expect(preview.textContent).toContain('Live tagline');
      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(previewText()).toContain('LIVE PREVIEW');
    });

    it('renders the preview inert, with decorative hearts and sample listings', () => {
      fixture.detectChanges();

      const preview = fixture.nativeElement.querySelector('app-seller-storefront') as HTMLElement;

      expect(preview.hasAttribute('inert')).toBe(true);
      expect(preview.querySelectorAll('app-listing-card')).toHaveLength(3);
      expect(preview.querySelectorAll('app-favourite-button')).toHaveLength(0);
      expect(preview.querySelectorAll('.preview-heart')).toHaveLength(3);
    });

    it('previews the sellers real listings when they have some', async () => {
      mockGetPublishedListingsBySeller.mockResolvedValue({
        data: [
          { id: 'a', title: 'Real jacket', price: 100, image_path: null, status: 'published' },
          { id: 'b', title: 'Real boots', price: 200, image_path: null, status: 'published' },
        ],
        error: null,
      });

      await component.loadProfile();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll(
        'app-seller-storefront app-listing-card',
      );

      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Real jacket');
    });

    it('falls back to sample listings when the listings cannot be loaded', async () => {
      mockGetPublishedListingsBySeller.mockResolvedValue({ data: null, error: { message: 'x' } });

      await component.loadProfile();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelectorAll('app-seller-storefront app-listing-card'),
      ).toHaveLength(3);
    });
  });

  describe('editor tabs', () => {
    const panel = (id: string) =>
      fixture.nativeElement.querySelector(`#panel-${id}`) as HTMLElement;

    it('starts on the profile tab, with the preview always visible', async () => {
      fixture.detectChanges();

      expect(component.activeTab()).toBe('profile');
      expect(panel('profile').hidden).toBe(false);
      expect(panel('storefront').hidden).toBe(true);
      expect(fixture.nativeElement.querySelector('app-seller-storefront')).not.toBeNull();
    });

    it('switches panels without removing either from the page', async () => {
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('#tab-storefront') as HTMLElement).click();
      fixture.detectChanges();

      expect(panel('profile').hidden).toBe(true);
      expect(panel('storefront').hidden).toBe(false);
      expect(fixture.nativeElement.querySelector('#display_name')).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('#tab-storefront')?.getAttribute('aria-selected'),
      ).toBe('true');
    });

    it('moves between tabs with the arrow keys', () => {
      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(component.activeTab()).toBe('storefront');

      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(component.activeTab()).toBe('profile');

      component.onTabKeydown(new KeyboardEvent('keydown', { key: 'End' }));
      expect(component.activeTab()).toBe('storefront');
    });

    it('returns to the profile tab when saving fails validation', async () => {
      component.activeTab.set('storefront');
      component.profileForm.patchValue({ display_name: '   ' });

      await component.onSubmit();

      expect(component.activeTab()).toBe('profile');
    });
  });
});
