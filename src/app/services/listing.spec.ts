import { TestBed } from '@angular/core/testing';
import { ListingService } from './listing';
import { SUPABASE_CLIENT } from './supabase';
import { ListingImageItem } from '../models/listing-image';

describe('ListingService.saveListingImages', () => {
  let service: ListingService;
  let calls: string[];
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  // What the database "currently references" for the verification step.
  let dbMain: string | null;
  let dbExtras: string[];

  const existing = (path: string): ListingImageItem => ({
    kind: 'existing',
    key: path,
    imagePath: path,
    url: path,
  });
  const fresh = (name: string): ListingImageItem => ({
    kind: 'new',
    key: name,
    file: new File(['x'], name, { type: 'image/png' }),
    url: 'blob:' + name,
  });

  beforeEach(() => {
    calls = [];
    dbMain = 'u/old-main.jpg';
    dbExtras = ['u/old-extra.jpg'];
    let uploadCount = 0;

    upload = vi.fn(async () => {
      uploadCount++;
      calls.push('upload');
      return { data: { path: `u/new-${uploadCount}.png` }, error: null };
    });
    remove = vi.fn(async (paths: string[]) => {
      calls.push('remove:' + paths[0]);
      return { error: null };
    });
    rpc = vi.fn(async () => {
      calls.push('rpc');
      return { data: ['u/old-extra.jpg'], error: null };
    });

    const from = vi.fn((table: string) => {
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'l1', image_path: dbMain }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: dbExtras.map((image_path, i) => ({ image_path, position: i + 1 })),
              error: null,
            }),
          }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SUPABASE_CLIENT,
          useValue: { rpc, from, storage: { from: () => ({ upload, remove }) } },
        },
      ],
    });
    service = TestBed.inject(ListingService);
  });

  it('sends the ordered paths (new image as main) and deletes dropped files only after the RPC', async () => {
    const { error } = await service.saveListingImages('l1', 'u', [
      fresh('a.png'),
      existing('u/old-main.jpg'),
    ]);

    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('set_listing_images', {
      p_listing_id: 'l1',
      p_image_paths: ['u/new-1.png', 'u/old-main.jpg'],
    });
    expect(calls).toEqual(['upload', 'rpc', 'remove:u/old-extra.jpg']);
  });

  it('never deletes existing files when the RPC fails, and removes its own unreferenced uploads', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    const { error } = await service.saveListingImages('l1', 'u', [
      existing('u/old-main.jpg'),
      fresh('a.png'),
    ]);

    expect(error).toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(['u/new-1.png']);
  });

  it('keeps uploads that the database already references (lost RPC response)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('network') });
    dbExtras = ['u/new-1.png'];

    await service.saveListingImages('l1', 'u', [existing('u/old-main.jpg'), fresh('a.png')]);

    expect(remove).not.toHaveBeenCalled();
  });

  it('removes already uploaded files when a later upload fails, without calling the RPC', async () => {
    upload
      .mockResolvedValueOnce({ data: { path: 'u/first.png' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('upload failed') });

    const { error } = await service.saveListingImages('l1', 'u', [fresh('a.png'), fresh('b.png')]);

    expect(error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(['u/first.png']);
  });

  it('supports removing every image', async () => {
    rpc.mockResolvedValueOnce({ data: ['u/old-main.jpg', 'u/old-extra.jpg'], error: null });

    const { error } = await service.saveListingImages('l1', 'u', []);

    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('set_listing_images', {
      p_listing_id: 'l1',
      p_image_paths: [],
    });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
