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

  private auth = inject(Auth);

  isRecoveryMode = this.auth.isPasswordRecovery;

  errorMessage = signal('');
  successMessage = signal('');
  verificationError = signal('');

  ngOnInit() {
    const params = new URLSearchParams(window.location.hash.slice(1));

    if (params.has('error')) {
      this.verificationError.set(
        'This password reset link is invalid or has expired. Please request a new one.',
      );
    }
  }

  async onSubmit() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.isRecoveryMode()) {
      this.errorMessage.set('Invalid or expired password reset link.');
      return;
    }

    const { error } = await this.auth.updatePassword(this.password);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    this.successMessage.set('Your password has been updated successfully!');
  }
}
