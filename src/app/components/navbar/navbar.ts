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
import { Router, RouterLink, NavigationStart } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  imports: [RouterLink],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnDestroy {
  private auth = inject(Auth);
  private router = inject(Router);
  private supabase = inject(SUPABASE_CLIENT);

  readonly isLoggedIn = this.auth.isLoggedIn;
  static readonly menuOpen = signal(false);
  readonly isMenuOpen = Navbar.menuOpen;

  readonly logoutError = signal('');
  readonly logoutSuccess = signal('');
  readonly isLoggingOut = signal(false);
  readonly isToastLeaving = signal(false);

  private toastTimer?: ReturnType<typeof setTimeout>;
  private toastRemoveTimer?: ReturnType<typeof setTimeout>;

  readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

  constructor() {
    effect(() => {
      if (this.isLoggedIn()) {
        this.clearLogoutMessage();
      }
    });

    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.clearLogoutMessage();
      }
    });
  }

  toggleMenu() {
    const willOpen = !this.isMenuOpen();

    this.isMenuOpen.set(willOpen);

    if (willOpen) {
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

      this.closeMenu();
      await this.router.navigate(['/']);

      this.showToast('You have been logged out successfully.');
    } catch {
      this.showToast('Something went wrong. Please try again.', true);
    } finally {
      this.isLoggingOut.set(false);
    }
  }

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

  ngOnDestroy() {
    this.clearToastTimers();
  }
}
