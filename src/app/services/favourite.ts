import { Service, inject, signal } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import { Listing } from '../models/listing';

type FavouriteError = { message: string; code?: string };
type FavouriteResult = { error: FavouriteError | null };

const UNIQUE_VIOLATION = '23505';

@Service()
export class FavouriteService {
  private supabase = inject(SUPABASE_CLIENT);

  private readonly favouriteIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly countsState = signal<ReadonlyMap<string, number>>(new Map());

  readonly favouriteIds = this.favouriteIdsState.asReadonly();
  readonly counts = this.countsState.asReadonly();

  private userId: string | null = null;
  private generation = 0;
  private loadingIds: Promise<void> | null = null;
  private pendingToggles = new Map<string, Promise<unknown>>();
  private countVersions = new Map<string, number>();
  private nextCountVersion = 0;

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.setUser(session?.user.id ?? null);
    });
  }

  isSaved(listingId: string): boolean {
    return this.favouriteIdsState().has(listingId);
  }

  // null means the public count has not been loaded yet.
  countFor(listingId: string): number | null {
    return this.countsState().get(listingId) ?? null;
  }

  async loadCount(listingId: string): Promise<FavouriteResult> {
    const version = this.bumpCountVersion(listingId);

    try {
      const { data, error } = await this.supabase.rpc('get_listing_favourite_count', {
        p_listing_id: listingId,
      });

      if (error) return { error };

      // Do not overwrite a newer request or an optimistic update.
      if (this.countVersions.get(listingId) === version) {
        this.setCount(listingId, Number(data ?? 0));
      }

      return { error: null };
    } catch (error) {
      return { error: this.toError(error) };
    }
  }

  async loadCounts(listingIds: string[]): Promise<FavouriteResult> {
    const results = await Promise.all(listingIds.map((id) => this.loadCount(id)));
    return { error: results.find((result) => result.error)?.error ?? null };
  }

  async toggle(listingId: string): Promise<FavouriteResult> {
    if (!this.userId) {
      return { error: new Error('You must be logged in.') };
    }

    if (this.pendingToggles.has(listingId)) {
      return { error: new Error('Another update is already in progress.') };
    }

    const generation = this.generation;
    const run = this.runToggle(listingId, generation);
    this.pendingToggles.set(listingId, run);

    // setUser() clears the map; don't remove a newer user's pending toggle.
    void run.finally(() => {
      if (generation === this.generation && this.pendingToggles.get(listingId) === run) {
        this.pendingToggles.delete(listingId);
      }
    });

    return run;
  }

  // Resolves when the in-flight toggle for this listing (if any) has finished.
  async whenToggleSettled(listingId: string): Promise<void> {
    await this.pendingToggles.get(listingId);
  }

  private async runToggle(listingId: string, generation: number): Promise<FavouriteResult> {
    try {
      // Wait for the current user's saved ids before choosing INSERT or DELETE.
      if (this.loadingIds) await this.loadingIds;

      if (generation !== this.generation || !this.userId) {
        return { error: new Error('Your session changed. Please try again.') };
      }

      const userId = this.userId;
      const wasSaved = this.isSaved(listingId);
      this.setSaved(listingId, !wasSaved);
      this.adjustCount(listingId, wasSaved ? -1 : 1);
      const optimisticVersion = this.countVersions.get(listingId);

      let error: FavouriteError | null = null;
      try {
        const result = wasSaved
          ? await this.supabase
              .from('favourites')
              .delete()
              .eq('user_id', userId)
              .eq('listing_id', listingId)
          : await this.supabase
              .from('favourites')
              .insert({ user_id: userId, listing_id: listingId });
        error = result.error;
      } catch (cause) {
        error = this.toError(cause);
      }

      const sameUser = generation === this.generation;
      const duplicate = !wasSaved && error?.code === UNIQUE_VIOLATION;

      if (sameUser) {
        if (error && !duplicate) {
          this.setSaved(listingId, wasSaved);
        }
        // A duplicate means the listing really is saved; keep the heart filled.
      }

      // Correct only our own optimistic count. If a newer count update
      // happened, reconcile from the database rather than adjusting it.
      const countUnchanged = this.countVersions.get(listingId) === optimisticVersion;
      if (sameUser && countUnchanged && error && !duplicate) {
        this.adjustCount(listingId, wasSaved ? 1 : -1);
      } else if (sameUser && countUnchanged && duplicate) {
        this.adjustCount(listingId, -1);
      } else if (!sameUser || (!countUnchanged && (error || duplicate))) {
        await this.loadCount(listingId);
      }

      return { error: duplicate ? null : error };
    } catch (cause) {
      return { error: this.toError(cause) };
    }
  }

  async getFavouriteListings(): Promise<{
    data: Listing[] | null;
    error: FavouriteError | null;
  }> {
    const userId = this.userId;
    const generation = this.generation;

    if (!userId) {
      return { data: null, error: new Error('You must be logged in.') };
    }

    try {
      const { data, error } = await this.supabase
        .from('favourites')
        .select('created_at, listings(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (generation !== this.generation) {
        return { data: null, error: new Error('Your session changed. Please try again.') };
      }
      if (error) return { data: null, error };

      const rows = (data ?? []) as unknown as { listings: Listing | null }[];
      return {
        data: rows
          .map((row) => row.listings)
          .filter((listing): listing is Listing => listing !== null),
        error: null,
      };
    } catch (cause) {
      return { data: null, error: this.toError(cause) };
    }
  }

  private setUser(userId: string | null) {
    if (userId === this.userId) return;

    this.userId = userId;
    this.generation++;
    this.pendingToggles.clear();
    this.loadingIds = null;
    this.favouriteIdsState.set(new Set());

    if (userId) {
      const generation = this.generation;
      // Supabase auth callbacks must not await another Supabase request.
      const loading: Promise<void> = new Promise<void>((resolve) => setTimeout(resolve, 0))
        .then(() => this.loadFavouriteIds(userId, generation))
        .catch((error) => console.error('Could not load favourites:', error))
        .finally(() => {
          if (this.loadingIds === loading) this.loadingIds = null;
        });
      this.loadingIds = loading;
    }
  }

  private async loadFavouriteIds(userId: string, generation: number) {
    if (generation !== this.generation) return;

    const { data, error } = await this.supabase
      .from('favourites')
      .select('listing_id')
      .eq('user_id', userId);

    if (generation !== this.generation) return;
    if (error) {
      console.error('Could not load favourites:', error);
      return;
    }

    this.favouriteIdsState.set(
      new Set((data ?? []).map((row: { listing_id: string }) => row.listing_id)),
    );
  }

  private setSaved(listingId: string, saved: boolean) {
    this.favouriteIdsState.update((ids) => {
      const next = new Set(ids);
      if (saved) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
  }

  private setCount(listingId: string, count: number) {
    this.countsState.update((counts) => new Map(counts).set(listingId, count));
  }

  private adjustCount(listingId: string, delta: number) {
    this.bumpCountVersion(listingId);
    const current = this.countsState().get(listingId);
    if (current !== undefined) this.setCount(listingId, Math.max(0, current + delta));
  }

  private bumpCountVersion(listingId: string): number {
    const version = ++this.nextCountVersion;
    this.countVersions.set(listingId, version);
    return version;
  }

  private toError(error: unknown): FavouriteError {
    if (error instanceof Error) return error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return { message: String(error.message) };
    }
    return { message: 'An unexpected error occurred.' };
  }
}
