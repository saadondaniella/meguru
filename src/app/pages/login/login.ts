import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Profile } from '../../services/profile';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  email = '';
  password = '';

  errorMessage = signal('');
  successMessage = signal('');
  isLoading = signal(false);
  showPassword = signal(false);

  private auth = inject(Auth);

  private router = inject(Router);
  private profileService = inject(Profile);

  async onSubmit() {
    if (this.isLoading()) return;

    this.errorMessage.set('');
    this.successMessage.set('');
    this.isLoading.set(true);

    try {
      const { error } = await this.auth.signIn(this.email.trim(), this.password);

      if (error) {
        this.errorMessage.set(
          error.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Please try again.'
            : 'Unable to log in right now. Please try again later.',
        );
        return;
      }

      const { data: sessionData } = await this.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        this.errorMessage.set('Could not verify your session. Please try again.');
        return;
      }

      const { data: profile, error: profileError } = await this.profileService.getProfile(userId);

      if (profileError) {
        this.errorMessage.set('Could not load your profile. Please try again.');
        return;
      }

      await this.router.navigate([
        profile?.display_name?.trim() ? '/dashboard' : '/seller-profile',
      ]);
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
