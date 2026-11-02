import { TestBed } from '@angular/core/testing';
import { FavouriteService } from './favourite';
import { SUPABASE_CLIENT } from './supabase';

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

interface Call {
  table: string;
  op: 'select' | 'insert' | 'delete';
  args: unknown[];
  filters: [string, unknown][];
}

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));

  return { promise, resolve };
}

// Lets the service's deferred (setTimeout) loading and its promise chain finish.
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const filterValue = (call: Call, column: string) =>
  call.filters.find(([name]) => name === column)?.[1];

function setup() {
  const calls: Call[] = [];
  let authCallback!: AuthCallback;

  const handlers = {
    respond: (_call: Call): Promise<Result> => Promise.resolve({ data: [], error: null }),
    rpc: (_name: string, _args: unknown): Promise<Result> =>
      Promise.resolve({ data: 0, error: null }),
  };

  const from = vi.fn((table: string) => {
    const call: Call = { table, op: 'select', args: [], filters: [] };
    calls.push(call);

    const builder = {
      select: (...args: unknown[]) => {
        call.args = args;
        return builder;
      },
      insert: (...args: unknown[]) => {
        call.op = 'insert';
        call.args = args;
        return builder;
      },
      delete: () => {
        call.op = 'delete';
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      order: () => builder,
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        handlers.respond(call).then(resolve, reject),
    };

    return builder;
  });

  const client = {
    from,
    rpc: vi.fn((name: string, args: unknown) => handlers.rpc(name, args)),
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
    },
  };

  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE_CLIENT, useValue: client }],
  });

  const service = TestBed.inject(FavouriteService);

  const signIn = async (userId: string) => {
    authCallback('SIGNED_IN', { user: { id: userId } });
    await flush();
  };

  const writes = () => calls.filter((call) => call.op !== 'select');

  return { service, client, handlers, calls, writes, signIn };
}

// Favourites of each user, returned for the "load saved ids" query.
const savedIdsFor =
  (byUser: Record<string, string[]>) =>
  (call: Call): Promise<Result> => {
    if (call.op === 'select') {
      const ids = byUser[filterValue(call, 'user_id') as string] ?? [];
      return Promise.resolve({ data: ids.map((listing_id) => ({ listing_id })), error: null });
    }

    return Promise.resolve({ error: null });
  };

describe('FavouriteService', () => {
  describe('saved listings and auth changes', () => {
    it('loads the saved ids of the signed-in user', async () => {
      const { service, handlers, calls, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['a', 'b'] });

      await signIn('u1');

      expect(service.isSaved('a')).toBe(true);
      expect(service.isSaved('b')).toBe(true);
      expect(service.isSaved('c')).toBe(false);
      expect(calls[0].table).toBe('favourites');
      expect(filterValue(calls[0], 'user_id')).toBe('u1');
    });

    it('clears saved ids on logout', async () => {
      const { service, handlers, client, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['a'] });
      await signIn('u1');

      const callback = client.auth.onAuthStateChange.mock.calls[0][0] as AuthCallback;
      callback('SIGNED_OUT', null);

      expect(service.isSaved('a')).toBe(false);
      expect(service.favouriteIds().size).toBe(0);
    });

    it('replaces saved ids when another account signs in', async () => {
      const { service, handlers, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['a'], u2: ['b'] });

      await signIn('u1');
      await signIn('u2');

      expect(service.isSaved('a')).toBe(false);
      expect(service.isSaved('b')).toBe(true);
    });

    it('discards a stale load that resolves after the user switched', async () => {
      const { service, handlers, signIn } = setup();
      const slow = deferred<Result>();

      handlers.respond = (call) =>
        filterValue(call, 'user_id') === 'u1' ? slow.promise : savedIdsFor({ u2: ['b'] })(call);

      await signIn('u1');
      await signIn('u2');

      slow.resolve({ data: [{ listing_id: 'a' }], error: null });
      await flush();

      expect(service.isSaved('a')).toBe(false);
      expect(service.isSaved('b')).toBe(true);
    });

    it('ignores token refreshes for the same user', async () => {
      const { service, handlers, calls, client, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['a'] });
      await signIn('u1');

      const callback = client.auth.onAuthStateChange.mock.calls[0][0] as AuthCallback;
      callback('TOKEN_REFRESHED', { user: { id: 'u1' } });
      await flush();

      expect(service.isSaved('a')).toBe(true);
      expect(calls.length).toBe(1);
    });
  });

  describe('toggle', () => {
    it('saves a listing and increases a loaded count', async () => {
      const { service, handlers, writes, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      const { error } = await service.toggle('x');

      expect(error).toBeNull();
      expect(service.isSaved('x')).toBe(true);
      expect(service.countFor('x')).toBe(4);
      expect(writes()).toHaveLength(1);
      expect(writes()[0]).toMatchObject({
        table: 'favourites',
        op: 'insert',
        args: [{ user_id: 'u1', listing_id: 'x' }],
      });
    });

    it('removes a saved listing and decreases the count', async () => {
      const { service, handlers, writes, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['x'] });
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      const { error } = await service.toggle('x');

      expect(error).toBeNull();
      expect(service.isSaved('x')).toBe(false);
      expect(service.countFor('x')).toBe(2);
      expect(writes()[0]).toMatchObject({ table: 'favourites', op: 'delete' });
      expect(writes()[0].filters).toEqual([
        ['user_id', 'u1'],
        ['listing_id', 'x'],
      ]);
    });

    it('never lets a count go below zero', async () => {
      const { service, handlers, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['x'] });
      await signIn('u1');
      await service.loadCount('x');

      await service.toggle('x');

      expect(service.countFor('x')).toBe(0);
    });

    it('keeps an unloaded count unknown instead of inventing one', async () => {
      const { service, signIn } = setup();
      await signIn('u1');

      await service.toggle('x');

      expect(service.countFor('x')).toBeNull();
    });

    it('rolls back the saved state and count when saving fails', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      handlers.respond = () => Promise.resolve({ error: { message: 'boom' } });
      const { error } = await service.toggle('x');

      expect(error?.message).toBe('boom');
      expect(service.isSaved('x')).toBe(false);
      expect(service.countFor('x')).toBe(3);
    });

    it('rolls back a failed removal', async () => {
      const { service, handlers, signIn } = setup();
      handlers.respond = savedIdsFor({ u1: ['x'] });
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      handlers.respond = () => Promise.resolve({ error: { message: 'boom' } });
      await service.toggle('x');

      expect(service.isSaved('x')).toBe(true);
      expect(service.countFor('x')).toBe(3);
    });

    it('treats an already saved listing as saved without double counting', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      handlers.respond = () =>
        Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
      const { error } = await service.toggle('x');

      expect(error).toBeNull();
      expect(service.isSaved('x')).toBe(true);
      expect(service.countFor('x')).toBe(3);
    });

    it('ignores a second toggle while the first is in flight', async () => {
      const { service, handlers, writes, signIn } = setup();
      await signIn('u1');

      const slow = deferred<Result>();
      handlers.respond = () => slow.promise;

      const first = service.toggle('x');
      const second = await service.toggle('x');

      expect(second.error).not.toBeNull();

      slow.resolve({ error: null });
      expect((await first).error).toBeNull();

      expect(writes()).toHaveLength(1);
      expect(service.isSaved('x')).toBe(true);

      // Free again once the first one finished.
      handlers.respond = () => Promise.resolve({ error: null });
      expect((await service.toggle('x')).error).toBeNull();
      expect(service.isSaved('x')).toBe(false);
    });

    it('lets callers wait for an in-flight toggle to settle', async () => {
      const { service, handlers, writes, signIn } = setup();
      await signIn('u1');

      const slow = deferred<Result>();
      handlers.respond = () => slow.promise;

      const first = service.toggle('x');
      let settled = false;
      const waiting = service.whenToggleSettled('x').then(() => (settled = true));

      await flush();
      expect(settled).toBe(false);

      slow.resolve({ error: null });
      await first;
      await waiting;

      handlers.respond = () => Promise.resolve({ error: null });
      expect((await service.toggle('x')).error).toBeNull();
      expect(writes()).toHaveLength(2);
      await expect(service.whenToggleSettled('unknown')).resolves.toBeUndefined();
    });

    it('returns an error and changes nothing when nobody is logged in', async () => {
      const { service, writes } = setup();

      const { error } = await service.toggle('x');

      expect(error?.message).toBe('You must be logged in.');
      expect(service.isSaved('x')).toBe(false);
      expect(writes()).toHaveLength(0);
    });

    it('waits for the saved ids to load before deciding to add or remove', async () => {
      const { service, handlers, writes, client } = setup();
      const slow = deferred<Result>();
      handlers.respond = (call) =>
        call.op === 'select' ? slow.promise : Promise.resolve({ error: null });

      const callback = client.auth.onAuthStateChange.mock.calls[0][0] as AuthCallback;
      callback('SIGNED_IN', { user: { id: 'u1' } });

      const pending = service.toggle('a');
      await flush();
      slow.resolve({ data: [{ listing_id: 'a' }], error: null });

      expect((await pending).error).toBeNull();
      expect(writes()).toHaveLength(1);
      expect(writes()[0].op).toBe('delete');
      expect(service.isSaved('a')).toBe(false);
    });

    it('does not apply a result to another account after the user switched', async () => {
      const { service, handlers, signIn } = setup();
      await signIn('u1');

      const slow = deferred<Result>();
      handlers.respond = (call) => (call.op === 'insert' ? slow.promise : savedIdsFor({})(call));

      const pending = service.toggle('x');
      await signIn('u2');

      slow.resolve({ error: null });
      await pending;

      expect(service.isSaved('x')).toBe(false);
    });

    it('still rolls back the shared count when a failure arrives after a user switch', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      const slow = deferred<Result>();
      handlers.respond = (call) => (call.op === 'insert' ? slow.promise : savedIdsFor({})(call));

      const pending = service.toggle('x');
      expect(service.countFor('x')).toBe(4);

      await signIn('u2');
      slow.resolve({ error: { message: 'boom' } });
      await pending;

      expect(service.countFor('x')).toBe(3);
      expect(service.isSaved('x')).toBe(false);
    });
  });

  describe('counts', () => {
    it('calls the RPC with the listing id and shares the count', async () => {
      const { service, handlers, client } = setup();
      handlers.rpc = () => Promise.resolve({ data: 7, error: null });

      const { error } = await service.loadCount('x');

      expect(error).toBeNull();
      expect(client.rpc).toHaveBeenCalledWith('get_listing_favourite_count', {
        p_listing_id: 'x',
      });
      expect(service.countFor('x')).toBe(7);
      expect(service.counts().get('x')).toBe(7);
    });

    it('keeps the count unknown and returns the error when the RPC fails', async () => {
      const { service, handlers } = setup();
      handlers.rpc = () => Promise.resolve({ data: null, error: { message: 'nope' } });

      const { error } = await service.loadCount('x');

      expect(error?.message).toBe('nope');
      expect(service.countFor('x')).toBeNull();
    });

    it('loads several counts at once', async () => {
      const { service, handlers } = setup();
      handlers.rpc = (_name, args) =>
        Promise.resolve({
          data: (args as { p_listing_id: string }).p_listing_id === 'a' ? 1 : 2,
          error: null,
        });

      const { error } = await service.loadCounts(['a', 'b']);

      expect(error).toBeNull();
      expect(service.countFor('a')).toBe(1);
      expect(service.countFor('b')).toBe(2);
    });

    it('does not let an older count response overwrite a newer toggle', async () => {
      const { service, handlers, signIn } = setup();
      await signIn('u1');
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await service.loadCount('x');

      const slow = deferred<Result>();
      handlers.rpc = () => slow.promise;
      const loading = service.loadCount('x');

      await service.toggle('x');
      expect(service.countFor('x')).toBe(4);

      slow.resolve({ data: 3, error: null });
      await loading;

      expect(service.countFor('x')).toBe(4);
    });
  });

  describe('getFavouriteListings', () => {
    it('returns the listings of the favourites and skips hidden ones', async () => {
      const { service, handlers, calls, signIn } = setup();
      await signIn('u1');

      handlers.respond = () =>
        Promise.resolve({
          data: [
            { created_at: '2026-10-02', listings: { id: 'a', title: 'A' } },
            { created_at: '2026-10-01', listings: null },
            { created_at: '2026-09-30', listings: { id: 'b', title: 'B' } },
          ],
          error: null,
        });

      const { data, error } = await service.getFavouriteListings();

      expect(error).toBeNull();
      expect(data?.map((listing) => listing.id)).toEqual(['a', 'b']);
      expect(calls.at(-1)?.args).toEqual(['created_at, listings(*)']);
      expect(filterValue(calls.at(-1)!, 'user_id')).toBe('u1');
    });

    it('returns an error when nobody is logged in', async () => {
      const { service } = setup();

      const { data, error } = await service.getFavouriteListings();

      expect(data).toBeNull();
      expect(error?.message).toBe('You must be logged in.');
    });

    it('returns the query error', async () => {
      const { service, handlers, signIn } = setup();
      await signIn('u1');
      handlers.respond = () => Promise.resolve({ error: { message: 'boom' } });

      const { data, error } = await service.getFavouriteListings();

      expect(data).toBeNull();
      expect(error?.message).toBe('boom');
    });
  });

  describe('additional concurrency and exception cases', () => {
    it('releases a pending toggle if the session changes while saved ids are loading', async () => {
      const { service, handlers, client, writes } = setup();
      const slow = deferred<Result>();
      handlers.respond = (call) =>
        call.op === 'select' && filterValue(call, 'user_id') === 'u1'
          ? slow.promise
          : savedIdsFor({})(call);

      const callback = client.auth.onAuthStateChange.mock.calls[0][0] as AuthCallback;
      callback('SIGNED_IN', { user: { id: 'u1' } });
      const pending = service.toggle('x');
      await flush();
      callback('SIGNED_OUT', null);
      slow.resolve({ data: [], error: null });

      expect((await pending).error?.message).toContain('session changed');
      expect(writes()).toHaveLength(0);
      expect(service.isSaved('x')).toBe(false);
    });

    it('restores optimistic state and releases the lock if a write rejects', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      handlers.respond = (call) =>
        call.op === 'insert' ? Promise.reject(new Error('network down')) : savedIdsFor({})(call);

      const result = await service.toggle('x');
      expect(result.error?.message).toBe('network down');
      expect(service.isSaved('x')).toBe(false);
      expect(service.countFor('x')).toBe(3);

      handlers.respond = savedIdsFor({});
      expect((await service.toggle('x')).error).toBeNull();
      expect(service.isSaved('x')).toBe(true);
    });

    it('does not erase the next account’s pending toggle when an old request finishes', async () => {
      const { service, handlers, signIn } = setup();
      await signIn('u1');
      const oldWrite = deferred<Result>();
      const newWrite = deferred<Result>();
      handlers.respond = (call) => {
        if (call.op !== 'insert') return savedIdsFor({})(call);
        const userId = (call.args[0] as { user_id: string }).user_id;
        return userId === 'u1' ? oldWrite.promise : newWrite.promise;
      };

      const first = service.toggle('x');
      await signIn('u2');
      const second = service.toggle('x');
      oldWrite.resolve({ error: null });
      await first;

      const third = await service.toggle('x');
      expect(third.error?.message).toContain('already in progress');
      newWrite.resolve({ error: null });
      expect((await second).error).toBeNull();
      expect(service.isSaved('x')).toBe(true);
    });

    it('reconciles the public count after a stale write finishes on account switch', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      const slow = deferred<Result>();
      handlers.respond = (call) => (call.op === 'insert' ? slow.promise : savedIdsFor({})(call));
      const pending = service.toggle('x');
      expect(service.countFor('x')).toBe(4);

      await signIn('u2');
      handlers.rpc = () => Promise.resolve({ data: 4, error: null });
      slow.resolve({ error: null });
      await pending;

      expect(service.isSaved('x')).toBe(false);
      expect(service.countFor('x')).toBe(4);
    });

    it('keeps the new account clean if an old duplicate-key response arrives', async () => {
      const { service, handlers, signIn } = setup();
      handlers.rpc = () => Promise.resolve({ data: 3, error: null });
      await signIn('u1');
      await service.loadCount('x');

      const slow = deferred<Result>();
      handlers.respond = (call) => (call.op === 'insert' ? slow.promise : savedIdsFor({})(call));
      const pending = service.toggle('x');
      await signIn('u2');
      slow.resolve({ error: { code: '23505', message: 'duplicate key' } });
      await pending;

      expect(service.isSaved('x')).toBe(false);
      expect(service.countFor('x')).toBe(3);
    });
  });
});
