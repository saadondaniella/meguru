import { Component, inject } from '@angular/core';
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

  private auth = inject(Auth);

  async onSubmit() {
    const { error } = await this.auth.resetPassword(this.email);

    if (error) {
      console.error('Password reset error:', error.message);
      return;
    }

    console.log('Password reset email requested!');
  }
}
