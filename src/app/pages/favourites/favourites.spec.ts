import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingService } from '../../services/listing';
import { Listing } from '../../models/listing';
import { Favourites } from './favourites';

const listing = (id: string) => ({ id, title: `Item ${id}`, status: 'published' }) as Listing;

describe('Favourites', () => {
  let fixture: ComponentFixture<Favourites>;
  let favouriteIds: ReturnType<typeof signal<ReadonlySet<string>>>;
  let getFavouriteListings: ReturnType<typeof vi.fn>;
  let toggle: ReturnType<typeof vi.fn>;
  let whenToggleSettled: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const titles = () => Array.from(el().querySelectorAll('h2')).map((h) => h.textContent?.trim());

  async function render() {
    fixture = TestBed.createComponent(Favourites);
    await fixture.whenStable();
  }

  beforeEach(() => {
    favouriteIds = signal<ReadonlySet<string>>(new Set());
    toggle = vi.fn(async () => ({ error: null }));
    whenToggleSettled = vi.fn(async () => undefined);
    getFavouriteListings = vi.fn(async () => ({ data: [listing('a'), listing('b')], error: null }));

    TestBed.configureTestingModule({
      imports: [Favourites],
      providers: [
        provideRouter([]),
        { provide: ListingService, useValue: { getListingImageUrl: (p: string) => p } },
        {
          provide: FavouriteService,
          useValue: {
            favouriteIds,
            counts: signal(new Map<string, number>()),
            loadCount: vi.fn(async () => ({ error: null })),
            getFavouriteListings,
            toggle,
            whenToggleSettled,
          },
        },
        { provide: Auth, useValue: { isLoggedIn: signal(true) } },
      ],
    });
  });

  it('shows saved listings', async () => {
    await render();
    expect(titles()).toEqual(['Item a', 'Item b']);
  });

  it('shows the empty state with a link to the marketplace', async () => {
    getFavouriteListings.mockResolvedValue({ data: [], error: null });
    await render();

    expect(el().textContent).toContain("haven't saved any favourites");
    expect(el().querySelector('a[href="/marketplace"]')).not.toBeNull();
  });

  it('shows an error and can retry', async () => {
    getFavouriteListings.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render();

    expect(el().querySelector('[role="alert"]')).not.toBeNull();

    el().querySelector<HTMLButtonElement>('button')?.click();
    await fixture.whenStable();

    expect(titles()).toEqual(['Item a', 'Item b']);
  });

  it('does not hide cards while saved ids are still loading', async () => {
    await render();
    favouriteIds.set(new Set(['a', 'b']));
    await fixture.whenStable();

    expect(titles()).toEqual(['Item a', 'Item b']);
  });

  it('removes a card when unfavourited and restores it if the request fails', async () => {
    favouriteIds.set(new Set(['a', 'b']));
    await render();

    favouriteIds.set(new Set(['b']));
    await fixture.whenStable();
    expect(titles()).toEqual(['Item b']);

    favouriteIds.set(new Set(['a', 'b']));
    await fixture.whenStable();
    expect(titles()).toEqual(['Item a', 'Item b']);
  });

  describe('undo toast', () => {
    const toast = () => el().querySelector('.toast');
    const undoButton = () => el().querySelector<HTMLButtonElement>('.toast button');

    async function removeA(fakeTimers = false) {
      favouriteIds.set(new Set(['a', 'b']));
      await render();
      if (fakeTimers) vi.useFakeTimers();
      favouriteIds.set(new Set(['b']));
      fixture.detectChanges();
      if (!fakeTimers) await fixture.whenStable();
    }

    // whenStable() can hang on fake timers, so advance and render by hand.
    const advance = (ms: number) => {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    };

    afterEach(() => vi.useRealTimers());

    it('announces the removal in a live region with an Undo button', async () => {
      await removeA();

      expect(el().querySelector('[role="status"]')?.textContent).toContain(
        'Removed from favourites',
      );
      expect(undoButton()?.textContent?.trim()).toBe('Undo');
    });

    it('disappears after about 5 seconds', async () => {
      await removeA(true);
      expect(toast()).not.toBeNull();

      advance(4900);
      expect(toast()).not.toBeNull();

      advance(200);
      expect(toast()).toBeNull();
    });

    it('stays while hovered and restarts when the pointer leaves', async () => {
      await removeA(true);

      toast()?.dispatchEvent(new Event('mouseenter'));
      advance(10000);
      expect(toast()).not.toBeNull();

      toast()?.dispatchEvent(new Event('mouseleave'));
      advance(5100);
      expect(toast()).toBeNull();
    });

    it('restores the favourite and the card on Undo', async () => {
      toggle.mockImplementation(async () => {
        favouriteIds.set(new Set(['a', 'b']));
        return { error: null };
      });
      await removeA();

      undoButton()?.click();
      await fixture.whenStable();

      expect(toggle).toHaveBeenCalledExactlyOnceWith('a');
      expect(titles()).toEqual(['Item a', 'Item b']);
      expect(toast()).toBeNull();
    });

    it('waits for the pending removal before restoring, and ignores double clicks', async () => {
      let finishRemoval!: () => void;
      whenToggleSettled.mockImplementation(
        () => new Promise<void>((resolve) => (finishRemoval = resolve)),
      );
      await removeA();

      undoButton()?.click();
      undoButton()?.click();
      await fixture.whenStable();

      expect(toggle).not.toHaveBeenCalled();
      expect(toast()).not.toBeNull();

      finishRemoval();
      await fixture.whenStable();

      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('keeps the toast while Undo is slow', async () => {
      toggle.mockImplementation(() => new Promise(() => undefined));
      await removeA(true);

      undoButton()?.click();
      await Promise.resolve();
      advance(20000);

      expect(toggle).toHaveBeenCalled();
      expect(toast()).not.toBeNull();
    });

    it('dismisses the toast when a failed removal is rolled back', async () => {
      await removeA();

      favouriteIds.set(new Set(['a', 'b']));
      await fixture.whenStable();

      expect(toast()).toBeNull();
      expect(titles()).toEqual(['Item a', 'Item b']);
    });

    it('shows a retry message when Undo fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      toggle.mockResolvedValue({ error: { message: 'boom' } });
      await removeA();

      undoButton()?.click();
      await fixture.whenStable();

      expect(toast()?.textContent).toContain('Could not restore');
      expect(undoButton()).not.toBeNull();
      expect(titles()).toEqual(['Item b']);
    });

    it('replaces the toast when another card is removed', async () => {
      await removeA();
      favouriteIds.set(new Set());
      await fixture.whenStable();

      toggle.mockClear();
      undoButton()?.click();
      await fixture.whenStable();

      expect(toggle).toHaveBeenCalledExactlyOnceWith('b');
    });

    it('does not offer Undo when all ids clear at once (logout)', async () => {
      favouriteIds.set(new Set(['a', 'b']));
      await render();
      favouriteIds.set(new Set());
      await fixture.whenStable();

      expect(toast()).toBeNull();
    });
  });
});
