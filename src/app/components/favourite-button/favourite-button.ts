import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingStatus } from '../../models/listing';

@Component({
  selector: 'app-favourite-button',
  templateUrl: './favourite-button.html',
  styleUrl: './favourite-button.css',
})
export class FavouriteButton {
  private favouriteService = inject(FavouriteService);
  private auth = inject(Auth);
  private router = inject(Router);

  readonly listingId = input.required<string>();
  readonly status = input<ListingStatus>('published');

  readonly isBusy = signal(false);
  readonly errorMessage = signal('');

  readonly isSaved = computed(() => this.favouriteService.favouriteIds().has(this.listingId()));

  // The RPC only counts published listings, so a sold listing would always show 0.
  // The count is also hidden until it has loaded, instead of showing a made-up 0.
  readonly count = computed(() =>
    this.status() === 'sold'
      ? null
      : (this.favouriteService.counts().get(this.listingId()) ?? null),
  );

  // Constant wording: the pressed state is announced through aria-pressed.
  readonly label = computed(() => {
    const count = this.count();

    if (count === null) return 'Save to favourites';

    return `Save to favourites, ${count} ${count === 1 ? 'save' : 'saves'}`;
  });

  constructor() {
    effect(() => {
      const listingId = this.listingId();
      const isSold = this.status() === 'sold';

      untracked(() => {
        this.errorMessage.set('');

        if (!isSold) {
          void this.loadCount(listingId);
        }
      });
    });
  }

  async toggle() {
    if (this.isBusy()) return;

    if (!this.auth.isLoggedIn()) {
      await this.router.navigate(['/login']);
      return;
    }

    this.errorMessage.set('');
    this.isBusy.set(true);

    try {
      const { error } = await this.favouriteService.toggle(this.listingId());

      if (error) {
        console.error('Could not update favourite:', error);
        this.errorMessage.set('Could not update. Try again.');
      }
    } finally {
      this.isBusy.set(false);
    }
  }

  private async loadCount(listingId: string) {
    const { error } = await this.favouriteService.loadCount(listingId);

    if (error) {
      console.error('Could not load favourite count:', error);
    }
  }
}
