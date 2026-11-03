import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Profile } from '../../services/profile';
import { EditorialFeature } from '../../components/editorial-feature/editorial-feature';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, EditorialFeature],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private auth = inject(Auth);
  private profileService = inject(Profile);
  private copyTimeout?: ReturnType<typeof setTimeout>;

  displayName = signal('');
  storefrontUrl = signal('');
  isLoading = signal(true);
  errorMessage = signal('');
  isCopied = signal(false);

  async ngOnInit() {
    try {
      const {
        data: { session },
        error,
      } = await this.auth.getSession();

      if (error) {
        throw error;
      }

      if (!session) {
        this.errorMessage.set('Unable to load your account.');
        return;
      }

      const userId = session.user.id;

      // Build the public storefront URL
      this.storefrontUrl.set(`${window.location.origin}/sellers/${userId}`);

      // Get the user's profile
      const { data: profile, error: profileError } = await this.profileService.getProfile(userId);

      if (profileError) {
        throw profileError;
      }

      this.displayName.set(profile?.display_name ?? '');
    } catch {
      this.errorMessage.set('Something went wrong while loading your dashboard.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async copyStorefrontUrl() {
    try {
      await navigator.clipboard.writeText(this.storefrontUrl());

      clearTimeout(this.copyTimeout);

      this.isCopied.set(true);

      this.copyTimeout = setTimeout(() => {
        this.isCopied.set(false);
      }, 3500);
    } catch {
      this.errorMessage.set('Unable to copy the link.');
    }
  }
}
