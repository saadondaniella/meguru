import {
  Component,
  inject,
  signal,
  effect,
  HostListener,
  viewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { Router, RouterLink, NavigationEnd, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Auth } from '../../services/auth';
import { Profile } from '../../services/profile';
import { ListingService } from '../../services/listing';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnDestroy {
  private auth = inject(Auth);
  private router = inject(Router);
  private supabase = inject(SUPABASE_CLIENT);
  private profileService = inject(Profile);
  private listingService = inject(ListingService);

  // AUTH
  readonly isLoggedIn = this.auth.isLoggedIn;

  // MENU
  static readonly menuOpen = signal(false);
  readonly isMenuOpen = Navbar.menuOpen;

  readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

  // PROFILE
  readonly currentUserId = signal<string | null>(null);
  readonly displayName = signal('');
  readonly avatarUrl = signal<string | null>(null);
  readonly activeListingsCount = signal(0);

  private profileRequestId = 0;

  // LOGOUT
  readonly logoutError = signal('');
  readonly logoutSuccess = signal('');
  readonly isLoggingOut = signal(false);
  readonly isToastLeaving = signal(false);

  private toastTimer?: ReturnType<typeof setTimeout>;
  private toastRemoveTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Update navbar when authentication changes.
    effect(() => {
      if (this.isLoggedIn()) {
        this.clearLogoutMessage();
        void this.loadNavbarAvatar();
      } else {
        this.profileRequestId++;
        this.resetProfileData();
      }
    });

    // Refresh profile information when navigating.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.clearLogoutMessage();
      }

      if (event instanceof NavigationEnd && this.isLoggedIn()) {
        void this.loadNavbarAvatar();
      }
    });
  }

  // PROFILE DATA

  private resetProfileData() {
    this.currentUserId.set(null);
    this.displayName.set('');
    this.avatarUrl.set(null);
    this.activeListingsCount.set(0);
  }

  async loadNavbarAvatar() {
    const requestId = ++this.profileRequestId;

    try {
      const { data, error } = await this.supabase.auth.getUser();

      if (requestId !== this.profileRequestId || !this.isLoggedIn()) {
        return;
      }

      if (error || !data.user) {
        this.resetProfileData();
        return;
      }

      const userId = data.user.id;
      this.currentUserId.set(userId);

      // Fetch profile and active listing count.
      const [profileResult, listingsResult] = await Promise.all([
        this.profileService.getProfile(userId),
        this.listingService.getActiveListingsCountBySeller(userId),
      ]);

      if (requestId !== this.profileRequestId || !this.isLoggedIn()) {
        return;
      }

      // Profile
      if (profileResult.error) {
        console.error('Could not load navbar profile:', profileResult.error);

        this.displayName.set('');
        this.avatarUrl.set(null);
      } else {
        const profile = profileResult.data;

        this.displayName.set(profile?.display_name ?? '');

        this.avatarUrl.set(this.profileService.getAvatarUrl(profile?.avatar_path ?? null));
      }

      // Active listings
      if (listingsResult.error) {
        console.error('Could not load active listings count:', listingsResult.error);

        this.activeListingsCount.set(0);
      } else {
        this.activeListingsCount.set(listingsResult.count ?? 0);
      }
    } catch (error) {
      if (requestId !== this.profileRequestId) {
        return;
      }

      console.error('Could not load navbar information:', error);
    }
  }

  // MENU

  toggleMenu() {
    const willOpen = !this.isMenuOpen();

    this.isMenuOpen.set(willOpen);

    if (willOpen) {
      if (this.isLoggedIn()) {
        void this.loadNavbarAvatar();
      }

      requestAnimationFrame(() => {
        this.closeButton()?.nativeElement.focus();
      });
    }
  }

  closeMenu() {
    if (!this.isMenuOpen()) return;

    this.isMenuOpen.set(false);
    this.menuButton()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isMenuOpen()) {
      this.closeMenu();
    }
  }

  onMenuTab(event: Event) {
    if (!this.isMenuOpen()) return;

    const keyboardEvent = event as KeyboardEvent;
    const panel = event.currentTarget as HTMLElement;

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );

    if (!focusableElements.length) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (keyboardEvent.shiftKey && document.activeElement === first) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }

  // TOAST NOTIFICATIONS

  private clearToastTimers() {
    clearTimeout(this.toastTimer);
    clearTimeout(this.toastRemoveTimer);
  }

  clearLogoutMessage() {
    this.clearToastTimers();
    this.isToastLeaving.set(false);
    this.logoutSuccess.set('');
    this.logoutError.set('');
  }

  private showToast(message: string, isError = false) {
    this.clearLogoutMessage();

    if (isError) {
      this.logoutError.set(message);
    } else {
      this.logoutSuccess.set(message);
    }

    this.toastTimer = setTimeout(() => {
      this.isToastLeaving.set(true);

      this.toastRemoveTimer = setTimeout(() => {
        this.clearLogoutMessage();
      }, 350);
    }, 3000);
  }

  // LOGOUT

  async onLogout() {
    if (this.isLoggingOut()) return;

    this.clearLogoutMessage();
    this.isLoggingOut.set(true);

    try {
      const { error } = await this.auth.signOut();

      if (error) {
        this.showToast('Could not log out. Please try again.', true);
        return;
      }

      this.profileRequestId++;
      this.resetProfileData();

      this.closeMenu();

      await this.router.navigate(['/']);

      this.showToast('You have been logged out successfully.');
    } catch {
      this.showToast('Something went wrong. Please try again.', true);
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  // NAVIGATION

  async goToMyProfile() {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user) {
      this.closeMenu();
      await this.router.navigate(['/login']);
      return;
    }

    this.closeMenu();

    await this.router.navigate(['/sellers', data.user.id]);
  }

  // CLEANUP

  ngOnDestroy() {
    this.profileRequestId++;
    this.clearToastTimers();
  }
}
