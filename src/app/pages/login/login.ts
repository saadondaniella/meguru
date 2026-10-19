import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  private auth = inject(Auth);

  async onSubmit() {
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const { error } = await this.auth.signIn(this.email, this.password);

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      this.successMessage.set('You are now logged in!');
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    }
  }
}
