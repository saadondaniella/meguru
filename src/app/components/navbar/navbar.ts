import {
  Component,
  inject,
  signal,
  effect,
  HostListener,
  viewChild,
  ElementRef,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  imports: [RouterLink],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar {
  private auth = inject(Auth);
  private router = inject(Router);

  readonly isLoggedIn = this.auth.isLoggedIn;
  static readonly menuOpen = signal(false);
  readonly isMenuOpen = Navbar.menuOpen;
  readonly logoutError = signal('');
  readonly logoutSuccess = signal('');
  readonly isLoggingOut = signal(false);

  constructor() {
    effect(() => {
      if (this.isLoggedIn()) {
        this.logoutSuccess.set('');
      }
    });
  }

  readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

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

  clearLogoutMessage() {
    this.logoutSuccess.set('');
    this.logoutError.set('');
  }

  async onLogout() {
    if (this.isLoggingOut()) return;

    this.logoutError.set('');
    this.logoutSuccess.set('');
    this.isLoggingOut.set(true);

    try {
      const { error } = await this.auth.signOut();

      if (error) {
        this.logoutError.set('Could not log out. Please try again.');
        return;
      }

      this.closeMenu();
      this.logoutSuccess.set('You have been logged out successfully.');
      await this.router.navigate(['/']);
    } catch {
      this.logoutError.set('Something went wrong. Please try again.');
    } finally {
      this.isLoggingOut.set(false);
    }
  }
}
