import { Component, inject, signal, effect } from '@angular/core';
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

      this.logoutSuccess.set('You have been logged out successfully.');
      await this.router.navigate(['/']);
    } catch {
      this.logoutError.set('Something went wrong. Please try again.');
    } finally {
      this.isLoggingOut.set(false);
    }
  }
}
