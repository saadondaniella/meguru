import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-update-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './update-password.html',
  styleUrl: './update-password.css',
})
export class UpdatePassword implements OnInit {
  password = '';
  confirmPassword = '';
  confirmPasswordTouched = false;

  private auth = inject(Auth);

  isRecoveryMode = this.auth.isPasswordRecovery;

  errorMessage = signal('');
  successMessage = signal('');
  verificationError = signal('');
  isLoading = signal(false);

  ngOnInit() {
    const params = new URLSearchParams(window.location.hash.slice(1));

    if (params.has('error')) {
      this.verificationError.set(
        'This password reset link is invalid or has expired. Please request a new one.',
      );
      return;
    }

    const hasRecoveryLink =
      params.has('access_token') ||
      params.has('token_hash') ||
      new URLSearchParams(window.location.search).has('code');

    if (!hasRecoveryLink && !this.isRecoveryMode()) {
      this.verificationError.set('No password reset link was found. Please request a new one.');
    }
  }

  async onSubmit() {
    if (this.isLoading()) return;

    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    if (!this.isRecoveryMode()) {
      this.errorMessage.set('Invalid or expired password reset link.');
      return;
    }

    this.isLoading.set(true);

    try {
      const { error } = await this.auth.updatePassword(this.password);

      if (error) {
        this.errorMessage.set(
          'Unable to update your password. Please request a new reset link and try again.',
        );
        return;
      }

      this.successMessage.set('Your password has been updated successfully!');
      this.auth.isPasswordRecovery.set(false);
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
