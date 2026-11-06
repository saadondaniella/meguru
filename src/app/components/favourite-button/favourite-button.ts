import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingStatus } from '../../models/listing';

@Component({
  imports: [RouterLink],
  selector: 'app-favourite-button',
  templateUrl: './favourite-button.html',
  styleUrl: './favourite-button.css',
})
export class FavouriteButton {
  private favouriteService = inject(FavouriteService);
  private auth = inject(Auth);

  readonly listingId = input.required<string>();
  readonly status = input<ListingStatus>('published');

  readonly isBusy = signal(false);
  readonly errorMessage = signal('');
  readonly showLoginPrompt = signal(false);

  private readonly heart = viewChild<ElementRef<HTMLButtonElement>>('heart');
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

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
    // Move focus into the login prompt as soon as it is rendered.
    effect(() => {
      this.dialog()?.nativeElement.querySelector<HTMLElement>('a, button')?.focus();
    });

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
      this.showLoginPrompt.set(true);
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

  closeLoginPrompt() {
    this.showLoginPrompt.set(false);
    this.heart()?.nativeElement.focus();
  }

  onPromptKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeLoginPrompt();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private async loadCount(listingId: string) {
    const { error } = await this.favouriteService.loadCount(listingId);

    if (error) {
      console.error('Could not load favourite count:', error);
    }
  }
}
