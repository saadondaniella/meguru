import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Profile } from '../../services/profile';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-seller-profile',
  styleUrl: './seller-profile.css',
  templateUrl: './seller-profile.html',
})
export class SellerProfile implements OnInit {
  private fb = inject(FormBuilder);
  private profileService = inject(Profile);
  private supabase = inject(SUPABASE_CLIENT);

  hasProfile = signal(false);
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
  });

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

      const { data, error } = await this.profileService.getProfile(userId);

      if (error) {
        console.error('Error loading profile:', error.message);
        this.loadError.set(true);
        this.errorMessage.set('Could not load your profile. Please try again.');
        return;
      }

      this.hasProfile.set(!!data);

      if (data) {
        this.profileForm.patchValue({
          display_name: data.display_name,
          bio: data.bio ?? '',
          city: data.city ?? '',
          contact_email: data.contact_email ?? '',
          instagram: data.instagram ?? '',
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
