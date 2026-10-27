import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SellerProfile } from './seller-profile';
import { Profile } from '../../services/profile';
import { SUPABASE_CLIENT } from '../../services/supabase';

describe('SellerProfile', () => {
  let component: SellerProfile;
  let fixture: ComponentFixture<SellerProfile>;

  const mockGetUser = vi.fn();
  const mockGetProfile = vi.fn();
  const mockUpdateProfile = vi.fn();
  const mockCreateProfile = vi.fn();

  beforeEach(async () => {
    mockGetUser.mockReset();
    mockGetProfile.mockReset();
    mockUpdateProfile.mockReset();
    mockCreateProfile.mockReset();

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
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            auth: {
              getUser: mockGetUser,
            },
          },
        },
        {
          provide: Profile,
          useValue: {
            getProfile: mockGetProfile,
            updateProfile: mockUpdateProfile,
            createProfile: mockCreateProfile,
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
    });
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
});
