import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  imports: [RouterLink],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnInit {
  private auth = inject(Auth);

  isLoggedIn = signal(false);

  async ngOnInit() {
    const { data } = await this.auth.getSession();
    this.isLoggedIn.set(!!data.session);

    this.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        this.isLoggedIn.set(true);
      }

      if (event === 'SIGNED_OUT') {
        this.isLoggedIn.set(false);
      }
    });
  }

  async onLogout() {
    const { error } = await this.auth.signOut();

    if (error) {
      console.error('Logout failed:', error.message);
      return;
    }
  }
}
