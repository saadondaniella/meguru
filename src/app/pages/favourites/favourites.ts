import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavouriteService } from '../../services/favourite';
import { Listing } from '../../models/listing';
import { ListingCard } from '../../components/listing-card/listing-card';

const TOAST_DURATION_MS = 5000;

@Component({
  selector: 'app-favourites',
  imports: [RouterLink, ListingCard],
  templateUrl: './favourites.html',
  styleUrl: './favourites.css',
})
export class Favourites implements OnInit {
  private favouriteService = inject(FavouriteService);
  private destroyRef = inject(DestroyRef);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private listings = signal<Listing[]>([]);
  private removedIds = signal<ReadonlySet<string>>(new Set());
  private previousIds: ReadonlySet<string> = new Set();

  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  // One undo toast at a time; a newer removal replaces it.
  readonly toast = signal<{ listingId: string; failed: boolean } | null>(null);
  readonly isUndoing = signal(false);

  readonly visibleListings = computed(() =>
    this.listings().filter((listing) => !this.removedIds().has(listing.id)),
  );

  constructor() {
    // The service removes an id optimistically and puts it back if the request
    // fails. Hide a card when its id disappears and show it again if it returns.
    // Ids that were never in the set (still loading) are not treated as removed.
    effect(() => {
      const ids = this.favouriteService.favouriteIds();

      untracked(() => {
        const previous = this.previousIds;
        this.previousIds = ids;

        const removedNow = [...previous].filter((id) => !ids.has(id));

        this.removedIds.update((removed) => {
          const next = new Set(removed);
          removedNow.forEach((id) => next.add(id));
          ids.forEach((id) => next.delete(id));
          return next;
        });

        // A single removal of a card on this page offers Undo. Several ids at
        // once means the session changed, not a user action.
        const [removedId] = removedNow;
        if (removedNow.length === 1 && this.listings().some((l) => l.id === removedId)) {
          this.toast.set({ listingId: removedId, failed: false });
          this.startToastTimer();
        }

        // The id came back: a failed removal was rolled back, or Undo worked.
        const current = this.toast();
        if (current && ids.has(current.listingId)) {
          this.dismissToast();
        }
      });
    });

    this.destroyRef.onDestroy(() => this.clearToastTimer());
  }

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.isLoading.set(true);
    this.hasError.set(false);

    const { data, error } = await this.favouriteService.getFavouriteListings();

    if (error) {
      console.error('Error loading favourites:', error);
      this.hasError.set(true);
    } else {
      this.removedIds.set(new Set());
      this.listings.set(data ?? []);
    }

    this.isLoading.set(false);
  }

  async undo() {
    const toast = this.toast();
    if (!toast || this.isUndoing()) return;

    this.isUndoing.set(true);
    this.clearToastTimer();

    // Let an in-flight removal finish first so the two requests never overlap.
    await this.favouriteService.whenToggleSettled(toast.listingId);

    // If the removal failed, the effect has already dismissed this toast.
    if (this.toast()?.listingId !== toast.listingId) {
      this.isUndoing.set(false);
      return;
    }

    const { error } = await this.favouriteService.toggle(toast.listingId);
    this.isUndoing.set(false);

    if (error && this.toast()?.listingId === toast.listingId) {
      console.error('Could not restore favourite:', error);
      this.toast.set({ listingId: toast.listingId, failed: true });
      this.startToastTimer();
    }
  }

  // Keep the toast while it is hovered or focused so it is easy to reach.
  pauseToast() {
    this.clearToastTimer();
  }

  resumeToast() {
    if (this.toast() && !this.isUndoing()) this.startToastTimer();
  }

  private dismissToast() {
    this.clearToastTimer();
    this.toast.set(null);
  }

  private startToastTimer() {
    this.clearToastTimer();
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_DURATION_MS);
  }

  private clearToastTimer() {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = null;
  }
}
