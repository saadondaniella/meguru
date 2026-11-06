import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { FavouriteService } from '../../services/favourite';
import { ListingStatus } from '../../models/listing';
import { FavouriteButton } from './favourite-button';

type ToggleResult = { error: { message: string } | null };

describe('FavouriteButton', () => {
  let fixture: ComponentFixture<FavouriteButton>;
  let favouriteIds: ReturnType<typeof signal<ReadonlySet<string>>>;
  let counts: ReturnType<typeof signal<ReadonlyMap<string, number>>>;
  let isLoggedIn: ReturnType<typeof signal<boolean>>;
  let service: {
    favouriteIds: typeof favouriteIds;
    counts: typeof counts;
    loadCount: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';

  async function render(listingId = 'a', status: ListingStatus = 'published') {
    fixture = TestBed.createComponent(FavouriteButton);
    fixture.componentRef.setInput('listingId', listingId);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
  }

  beforeEach(() => {
    favouriteIds = signal<ReadonlySet<string>>(new Set());
    counts = signal<ReadonlyMap<string, number>>(new Map());
    isLoggedIn = signal(true);

    service = {
      favouriteIds,
      counts,
      loadCount: vi.fn(async () => ({ error: null })),
      toggle: vi.fn(async (): Promise<ToggleResult> => ({ error: null })),
    };

    TestBed.configureTestingModule({
      imports: [FavouriteButton],
      providers: [
        provideRouter([]),
        { provide: FavouriteService, useValue: service },
        { provide: Auth, useValue: { isLoggedIn } },
      ],
    });

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  describe('display', () => {
    it('is a real button that does not submit forms', async () => {
      await render();

      expect(button().type).toBe('button');
    });

    it('shows an outlined heart when not saved', async () => {
      await render();

      expect(button().classList.contains('is-saved')).toBe(false);
      expect(button().getAttribute('aria-pressed')).toBe('false');
    });

    it('shows a filled heart when saved by the current user', async () => {
      favouriteIds.set(new Set(['a']));
      await render();

      expect(button().classList.contains('is-saved')).toBe(true);
      expect(button().getAttribute('aria-pressed')).toBe('true');
    });

    it('shows the shared count and follows later changes', async () => {
      counts.set(new Map([['a', 3]]));
      await render();

      expect(text()).toBe('3');

      counts.set(new Map([['a', 4]]));
      await fixture.whenStable();

      expect(text()).toBe('4');
    });

    it('stays in sync with saved state changed elsewhere', async () => {
      await render();

      favouriteIds.set(new Set(['a']));
      await fixture.whenStable();

      expect(button().getAttribute('aria-pressed')).toBe('true');
    });

    it('does not show a count until it has loaded, but shows a real zero', async () => {
      await render();
      expect(text()).toBe('');

      counts.set(new Map([['a', 0]]));
      await fixture.whenStable();

      expect(text()).toBe('0');
    });

    it('describes the action and the count in the accessible label', async () => {
      counts.set(new Map([['a', 1]]));
      await render();
      expect(button().getAttribute('aria-label')).toBe('Save to favourites, 1 save');

      counts.set(new Map([['a', 5]]));
      await fixture.whenStable();
      expect(button().getAttribute('aria-label')).toBe('Save to favourites, 5 saves');
    });

    it('uses a plain label while the count is unknown', async () => {
      await render();

      expect(button().getAttribute('aria-label')).toBe('Save to favourites');
    });
  });

  describe('sold listings', () => {
    it('hides the count and does not load it', async () => {
      counts.set(new Map([['a', 0]]));
      await render('a', 'sold');

      expect(text()).toBe('');
      expect(button().getAttribute('aria-label')).toBe('Save to favourites');
      expect(service.loadCount).not.toHaveBeenCalled();
    });

    it('still shows whether the user saved it', async () => {
      favouriteIds.set(new Set(['a']));
      await render('a', 'sold');

      expect(button().getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('loading the count', () => {
    it('loads the count on init', async () => {
      await render('a');

      expect(service.loadCount).toHaveBeenCalledTimes(1);
      expect(service.loadCount).toHaveBeenCalledWith('a');
    });

    it('loads the count again when the listing changes', async () => {
      await render('a');

      fixture.componentRef.setInput('listingId', 'b');
      await fixture.whenStable();

      expect(service.loadCount).toHaveBeenCalledTimes(2);
      expect(service.loadCount).toHaveBeenLastCalledWith('b');
    });

    it('does not reload the count when the saved state changes', async () => {
      await render('a');

      favouriteIds.set(new Set(['a']));
      counts.set(new Map([['a', 1]]));
      await fixture.whenStable();

      expect(service.loadCount).toHaveBeenCalledTimes(1);
    });

    it('survives a failed count request', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.loadCount.mockResolvedValue({ error: { message: 'nope' } });

      await render('a');

      expect(text()).toBe('');
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('clicking', () => {
    it('toggles the favourite when logged in', async () => {
      await render('a');

      button().click();
      await fixture.whenStable();

      expect(service.toggle).toHaveBeenCalledWith('a');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('ignores repeated clicks while a toggle is in progress', async () => {
      let finish!: (result: ToggleResult) => void;
      service.toggle.mockReturnValue(new Promise<ToggleResult>((resolve) => (finish = resolve)));
      await render('a');

      button().click();
      await fixture.whenStable();

      expect(button().getAttribute('aria-disabled')).toBe('true');

      button().click();
      button().click();
      await fixture.whenStable();

      expect(service.toggle).toHaveBeenCalledTimes(1);

      finish({ error: null });
      // The component awaits a plain promise, which whenStable does not track.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();

      expect(button().getAttribute('aria-disabled')).toBeNull();

      button().click();
      await fixture.whenStable();

      expect(service.toggle).toHaveBeenCalledTimes(2);
    });
  });

  describe('logged out', () => {
    const dialog = () =>
      (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]') as HTMLElement | null;
    const dialogItems = () =>
      Array.from(dialog()?.querySelectorAll<HTMLElement>('a[href], button') ?? []);
    const press = (key: string, init: KeyboardEventInit = {}) =>
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

    async function openPrompt() {
      isLoggedIn.set(false);
      await render('a');
      button().focus();
      button().click();
      await fixture.whenStable();
    }

    it('opens the prompt instead of redirecting or saving', async () => {
      await openPrompt();

      expect(dialog()).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(service.toggle).not.toHaveBeenCalled();
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(button().classList.contains('is-saved')).toBe(false);
    });

    it('has dialog semantics and explains why an account is needed', async () => {
      await openPrompt();

      expect(dialog()?.getAttribute('aria-modal')).toBe('true');
      expect(dialog()?.querySelector('#login-prompt-title')?.textContent).toBe(
        'Save your favourites',
      );
      expect(dialog()?.getAttribute('aria-labelledby')).toBe('login-prompt-title');
      expect(dialog()?.getAttribute('aria-describedby')).toBe('login-prompt-description');
      expect(dialog()?.textContent).toContain('Create an account or log in to save pieces');
    });

    it('links to login and registration', async () => {
      await openPrompt();

      const links = dialogItems().filter((el) => el.tagName === 'A');

      expect(links.map((a) => a.textContent?.trim())).toEqual(['Log in', 'Create account']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/login', '/register']);
    });

    it('moves focus into the dialog when it opens', async () => {
      await openPrompt();

      expect(dialog()?.contains(document.activeElement)).toBe(true);
    });

    it('closes with Continue browsing and returns focus to the heart', async () => {
      await openPrompt();

      dialogItems()
        .find((el) => el.textContent?.trim() === 'Continue browsing')
        ?.click();
      await fixture.whenStable();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(button());
      expect(navigate).not.toHaveBeenCalled();
    });

    it('closes with Escape and returns focus to the heart', async () => {
      await openPrompt();

      press('Escape');
      await fixture.whenStable();

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(button());
    });

    it('closes when the overlay is clicked, but not when the dialog is', async () => {
      await openPrompt();

      dialog()?.click();
      await fixture.whenStable();
      expect(dialog()).not.toBeNull();

      (fixture.nativeElement.querySelector('.login-prompt-overlay') as HTMLElement).click();
      await fixture.whenStable();
      expect(dialog()).toBeNull();
    });

    it('keeps Tab and Shift+Tab inside the dialog', async () => {
      await openPrompt();
      const items = dialogItems();
      const first = items[0];
      const last = items[items.length - 1];

      last.focus();
      press('Tab');
      expect(document.activeElement).toBe(first);

      first.focus();
      press('Tab', { shiftKey: true });
      expect(document.activeElement).toBe(last);
    });

    it('does not open the prompt when logged in', async () => {
      await render('a');

      button().click();
      await fixture.whenStable();

      expect(dialog()).toBeNull();
      expect(service.toggle).toHaveBeenCalledWith('a');
    });
  });

  describe('errors', () => {
    it('shows an alert and keeps the real saved state when toggling fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.toggle.mockResolvedValue({ error: { message: 'boom' } });
      await render('a');

      button().click();
      await fixture.whenStable();

      const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');

      expect(alert?.textContent?.trim()).toBe('Could not update. Try again.');
      expect(button().getAttribute('aria-pressed')).toBe('false');
      expect(button().getAttribute('aria-disabled')).toBeNull();
      expect(consoleError).toHaveBeenCalled();
    });

    it('clears the error after a successful retry', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.toggle.mockResolvedValueOnce({ error: { message: 'boom' } });
      await render('a');

      button().click();
      await fixture.whenStable();
      button().click();
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    });

    it('clears the error when the listing changes', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.toggle.mockResolvedValue({ error: { message: 'boom' } });
      await render('a');

      button().click();
      await fixture.whenStable();

      fixture.componentRef.setInput('listingId', 'b');
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    });
  });
});
