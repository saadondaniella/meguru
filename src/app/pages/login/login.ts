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

  private auth = inject(Auth);

  private router = inject(Router);

  async onSubmit() {
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const { error } = await this.auth.signIn(this.email, this.password);

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      await this.router.navigate(['/']);
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
    }
  }
}
