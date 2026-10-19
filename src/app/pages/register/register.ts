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

  errorMessage = signal('');
  successMessage = signal('');

  private auth = inject(Auth);

  async onSubmit() {
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const { error } = await this.auth.signUp(this.email, this.password);

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      this.successMessage.set('Account created! Check your email to confirm your account.');
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    }
  }
}
