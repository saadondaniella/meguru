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

  profileForm = this.fb.group({
    display_name: ['', [Validators.required, Validators.maxLength(50)]],
    bio: ['', Validators.maxLength(500)],
    city: ['', Validators.maxLength(50)],
    contact_email: ['', [Validators.email, Validators.maxLength(254)]],
    instagram: ['', [Validators.pattern(/^@?[a-zA-Z0-9._]{1,30}$/)]],
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

    try {
      const userId = await this.getCurrentUserId();

      if (!userId) {
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
    } catch {
      this.loadError.set(true);
      this.errorMessage.set('Could not load your profile. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSubmit() {
    if (this.isSaving()) return;

    this.successMessage.set('');
    this.errorMessage.set('');

    if (this.profileForm.invalid || !this.profileForm.controls.display_name.value?.trim()) {
      this.errorMessage.set('Please enter a valid display name.');
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

      const { error } = this.hasProfile()
        ? await this.profileService.updateProfile(userId, profileData)
        : await this.profileService.createProfile(profileData);

      if (error) {
        console.error('Error saving profile:', error.message);
        this.errorMessage.set('Something went wrong. Please try again.');
        return;
      }

      this.hasProfile.set(true);
      this.successMessage.set('Your profile has been saved!');
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
