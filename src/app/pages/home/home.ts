import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private router = inject(Router);
  private supabase = inject(SUPABASE_CLIENT);
  private auth = inject(Auth);
  readonly isLoggedIn = this.auth.isLoggedIn;

  search = signal('');

  onSearch() {
    const term = this.search().trim();

    if (!term) return;

    this.router.navigate(['/marketplace'], {
      queryParams: { search: term },
    });
  }

  async goToMyProfile() {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user) {
      await this.router.navigate(['/login']);
      return;
    }

    await this.router.navigate(['/sellers', data.user.id]);
  }
}
