import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-forgot-password',
  styleUrl: './forgot-password.css',
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  email = '';

  successMessage = signal('');
  errorMessage = signal('');

  private auth = inject(Auth);

  async onSubmit() {
    this.successMessage.set('');
    this.errorMessage.set('');

    try {
      const { error } = await this.auth.resetPassword(this.email.trim());

      if (error) {
        this.errorMessage.set(
          'We could not send the reset link right now. Please try again later.',
        );
        return;
      }

      this.successMessage.set(
        "If an account exists with this email, you'll receive a password reset link.",
      );
    } catch {
      this.errorMessage.set('Something went wrong. Please try again later.');
    }
  }
}
