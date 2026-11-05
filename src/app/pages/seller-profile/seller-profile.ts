import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Profile } from '../../services/profile';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import {
  DEFAULT_STOREFRONT_STYLE,
  StorefrontStyle,
  TAGLINE_MAX_LENGTH,
  isAccessiblePair,
  resolveStorefrontStyle,
  styleToColumns,
} from '../../models/storefront-theme';
import {
  SellerStorefront,
  StorefrontSeller,
} from '../../components/seller-storefront/seller-storefront';
import { sortStorefrontListings } from '../../models/storefront-listing-order';
import { StyleStudio } from '../../components/style-studio/style-studio';
import { SUPABASE_CLIENT } from '../../services/supabase';

type EditorTab = 'profile' | 'storefront';

const EDITOR_TABS: EditorTab[] = ['profile', 'storefront'];

const PLACEHOLDER_LISTINGS: Listing[] = [
  { title: 'Linen shirt', price: 450 },
  { title: 'Wool coat', price: 1200 },
  { title: 'Silk scarf', price: 300 },
].map(({ title, price }, index) => ({
  id: `placeholder-${index + 1}`,
  seller_id: '',
  title,
  description: null,
  price,
  category: 'budget',
  condition: 'very_good',
  image_path: null,
  created_at: '',
  status: 'published',
  brand: null,
  size_type: null,
  size: null,
  color: null,
}));

@Component({
  imports: [ReactiveFormsModule, RouterLink, StyleStudio, SellerStorefront],
  selector: 'app-seller-profile',
  styleUrl: './seller-profile.css',
  templateUrl: './seller-profile.html',
})
export class SellerProfile implements OnInit {
  private fb = inject(FormBuilder);
  private profileService = inject(Profile);
  private listingService = inject(ListingService);
  private destroyRef = inject(DestroyRef);
  private supabase = inject(SUPABASE_CLIENT);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  activeTab = signal<EditorTab>('profile');

  hasProfile = signal(false);
  userId = signal<string | null>(null);
  successMessage = signal('');
  errorMessage = signal('');
  isSaving = signal(false);
  isLoading = signal(true);
  loadError = signal(false);

  // PROFILE PICTURE
  avatarUrl = signal<string | null>(null);
  selectedAvatar = signal<File | null>(null);
  removeAvatar = signal(false);
  avatarError = signal('');

  private savedAvatarPath: string | null = null;
  private avatarPreviewUrl: string | null = null;

  profileForm = this.fb.group({
    display_name: ['', [Validators.required, Validators.maxLength(50)]],
    bio: ['', Validators.maxLength(500)],
    city: ['', Validators.maxLength(50)],
    contact_email: ['', [Validators.email, Validators.maxLength(254)]],
    instagram: ['', [Validators.maxLength(31), Validators.pattern(/^@?[a-zA-Z0-9._]{1,30}$/)]],
    // Optional, single line, plain text.
    tagline: [
      '',
      [Validators.maxLength(TAGLINE_MAX_LENGTH), Validators.pattern(/^[^\u0000-\u001F\u007F]*$/)],
    ],
  });

  readonly taglineMaxLength = TAGLINE_MAX_LENGTH;

  // STOREFRONT STYLE (edited in the style studio, saved with the profile)
  style = signal<StorefrontStyle>({ ...DEFAULT_STOREFRONT_STYLE });

  // Current form values, so the preview updates before anything is saved.
  private formValue = signal(this.profileForm.getRawValue());

  private sellerListings = signal<Listing[]>([]);

  previewSeller = computed<StorefrontSeller>(() => {
    const form = this.formValue();

    return {
      display_name: form.display_name?.trim() || 'Your name',
      tagline: form.tagline?.trim() || null,
      bio: form.bio?.trim() || null,
      city: form.city?.trim() || null,
      contact_email: form.contact_email?.trim() || null,
      instagram: form.instagram?.trim() || null,
      avatarUrl: this.avatarUrl(),
    };
  });

  // The seller's own listings, or samples so the image shape is always visible.
  previewListings = computed<Listing[]>(() => {
    // Sort first so the three shown reflect the chosen listing order.
    const own = sortStorefrontListings(this.sellerListings(), this.style().listingOrder).slice(
      0,
      3,
    );

    return own.length > 0 ? own : PLACEHOLDER_LISTINGS;
  });

  constructor() {
    this.profileForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formValue.set(this.profileForm.getRawValue()));
  }

  async getCurrentUserId(): Promise<string | null> {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return data.user.id;
  }

  async ngOnInit() {
    await this.loadProfile();
  }

  async loadProfile() {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.clearAvatarPreview();
    this.selectedAvatar.set(null);
    this.removeAvatar.set(false);
    this.avatarError.set('');

    try {
      const userId = await this.getCurrentUserId();

      if (!userId) {
        this.loadError.set(true);
        this.errorMessage.set('You must be logged in to view your profile.');
        return;
      }

      this.userId.set(userId);

      const { data, error } = await this.profileService.getProfile(userId);

      if (error) {
        console.error('Error loading profile:', error.message);
        this.loadError.set(true);
        this.errorMessage.set('Could not load your profile. Please try again.');
        return;
      }

      this.hasProfile.set(!!data);
      this.style.set(resolveStorefrontStyle(data));
      void this.loadSellerListings(userId);

      if (data) {
        this.profileForm.patchValue({
          display_name: data.display_name,
          bio: data.bio ?? '',
          city: data.city ?? '',
          contact_email: data.contact_email ?? '',
          instagram: data.instagram ?? '',
          tagline: data.tagline ?? '',
        });
      }

      // LOAD SAVED PROFILE PICTURE
      this.savedAvatarPath = data?.avatar_path ?? null;
      this.avatarUrl.set(this.profileService.getAvatarUrl(this.savedAvatarPath));

      this.profileForm.markAsPristine();
      this.profileForm.markAsUntouched();
    } catch {
      this.loadError.set(true);
      this.errorMessage.set('Could not load your profile. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // The preview shows the seller's real listings. Failing is harmless: samples are used.
  private async loadSellerListings(userId: string) {
    const { data, error } = await this.listingService.getPublishedListingsBySeller(userId);

    if (error) {
      console.error('Could not load listings for the preview:', error);
      this.sellerListings.set([]);
      return;
    }

    this.sellerListings.set(data ?? []);
  }

  // SELECT PROFILE PICTURE
  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.avatarError.set('');
    this.successMessage.set('');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxFileSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      this.avatarError.set('Please select a JPEG, PNG or WebP image.');
      input.value = '';
      return;
    }

    if (file.size > maxFileSize) {
      this.avatarError.set('The image must be smaller than 5 MB.');
      input.value = '';
      return;
    }

    this.clearAvatarPreview();

    this.avatarPreviewUrl = URL.createObjectURL(file);

    this.selectedAvatar.set(file);
    this.removeAvatar.set(false);
    this.avatarUrl.set(this.avatarPreviewUrl);

    input.value = '';
  }

  // REMOVE PROFILE PICTURE
  onRemoveAvatar() {
    this.clearAvatarPreview();

    this.selectedAvatar.set(null);
    this.removeAvatar.set(true);
    this.avatarUrl.set(null);
    this.avatarError.set('');
    this.successMessage.set('');
  }

  // CLEAN UP TEMPORARY IMAGE URL
  private clearAvatarPreview() {
    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
      this.avatarPreviewUrl = null;
    }
  }

  // Arrow keys, Home and End move between the editor tabs.
  onTabKeydown(event: KeyboardEvent) {
    const current = EDITOR_TABS.indexOf(this.activeTab());
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % EDITOR_TABS.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + EDITOR_TABS.length) % EDITOR_TABS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = EDITOR_TABS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.activeTab.set(EDITOR_TABS[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#tab-${EDITOR_TABS[next]}`)?.focus();
  }

  // Show the profile tab and move focus to the first invalid field.
  private focusFirstInvalidField() {
    this.activeTab.set('profile');

    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }

  async onSubmit() {
    if (this.isSaving()) return;

    this.successMessage.set('');
    this.errorMessage.set('');

    if (this.profileForm.invalid || !this.profileForm.controls.display_name.value?.trim()) {
      this.profileForm.markAllAsTouched();

      if (!this.profileForm.controls.display_name.value?.trim()) {
        this.profileForm.controls.display_name.setErrors({
          ...this.profileForm.controls.display_name.errors,
          required: true,
        });
      }

      this.errorMessage.set('Please correct the highlighted fields.');
      this.focusFirstInvalidField();
      return;
    }

    // The studio never offers an unreadable pair; this guards anyway.
    if (!isAccessiblePair(this.style().background, this.style().textColor)) {
      this.errorMessage.set('Please choose a text color with enough contrast.');
      return;
    }

    this.isSaving.set(true);

    try {
      const userId = await this.getCurrentUserId();

      if (!userId) {
        this.errorMessage.set('You must be logged in to save your profile.');
        return;
      }

      const form = this.profileForm.value;

      const profileData = {
        display_name: form.display_name?.trim() ?? '',
        bio: form.bio?.trim() || null,
        city: form.city?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        instagram: form.instagram?.trim() || null,
        tagline: form.tagline?.trim() || null,
        ...styleToColumns(this.style()),
      };

      // 1. SAVE PROFILE INFORMATION
      const { error } = this.hasProfile()
        ? await this.profileService.updateProfile(userId, profileData)
        : await this.profileService.createProfile(profileData);

      if (error) {
        console.error('Error saving profile:', error.message);
        this.errorMessage.set('Could not save your profile. Please try again.');
        return;
      }

      this.hasProfile.set(true);
      this.profileForm.markAsPristine();

      // 2. UPLOAD NEW AVATAR
      const newAvatar = this.selectedAvatar();

      if (newAvatar) {
        let newPath: string | null = null;

        try {
          newPath = await this.profileService.uploadAvatar(userId, newAvatar);

          const { error: avatarError } = await this.profileService.updateAvatarPath(
            userId,
            newPath,
          );

          if (avatarError) {
            throw avatarError;
          }
        } catch (avatarError) {
          // Clean up newly uploaded file if database update failed
          if (newPath) {
            try {
              await this.profileService.deleteAvatar(newPath);
            } catch (cleanupError) {
              console.error('Could not clean up uploaded avatar:', cleanupError);
            }
          }

          throw avatarError;
        }

        // Remove previous avatar after successful update
        if (this.savedAvatarPath) {
          try {
            await this.profileService.deleteAvatar(this.savedAvatarPath);
          } catch (cleanupError) {
            console.error('Could not remove previous avatar:', cleanupError);
          }
        }

        this.savedAvatarPath = newPath;
        this.selectedAvatar.set(null);
        this.removeAvatar.set(false);

        this.clearAvatarPreview();
        this.avatarUrl.set(this.profileService.getAvatarUrl(newPath));
      }

      // 3. REMOVE EXISTING AVATAR
      else if (this.removeAvatar() && this.savedAvatarPath) {
        const oldPath = this.savedAvatarPath;

        const { error: avatarError } = await this.profileService.updateAvatarPath(userId, null);

        if (avatarError) {
          throw avatarError;
        }

        this.savedAvatarPath = null;
        this.removeAvatar.set(false);
        this.avatarUrl.set(null);

        try {
          await this.profileService.deleteAvatar(oldPath);
        } catch (cleanupError) {
          console.error('Could not remove avatar file:', cleanupError);
        }
      }

      this.successMessage.set('Your profile has been saved!');
    } catch (error) {
      console.error('Error saving profile or avatar:', error);
      this.errorMessage.set('Could not complete saving your profile. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
