import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';

@Component({
  imports: [FormsModule],
  selector: 'app-register',
  styleUrl: './register.css',
  templateUrl: './register.html',
})
export class Register {
  email = '';
  password = '';
  confirmPassword = '';

  errorMessage = signal('');
  successMessage = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  isLoading = signal(false);

  private auth = inject(Auth);

  async onSubmit() {
    if (this.isLoading()) return;

    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);

    try {
      const { error } = await this.auth.signUp(this.email.trim(), this.password);

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      this.successMessage.set(
        'If email confirmation is required, please check your inbox for a confirmation link.',
      );
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
