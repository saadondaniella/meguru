import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

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

      await this.router.navigate(['/']);
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
