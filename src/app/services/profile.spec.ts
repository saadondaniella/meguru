import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Profile } from './profile';
import { SUPABASE_CLIENT } from './supabase';

describe('Profile', () => {
  let service: Profile;
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFrom = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            from: mockFrom,
          },
        },
      ],
    });

    service = TestBed.inject(Profile);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch the profile for the correct user', async () => {
    const userId = 'test-user-123';

    const mockProfile = {
      id: userId,
      display_name: 'Daniella',
    };

    const maybeSingle = vi.fn().mockResolvedValue({
      data: mockProfile,
      error: null,
    });

    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });

    mockFrom.mockReturnValue({ select });

    const result = await service.getProfile(userId);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('id', userId);
    expect(result.data).toEqual(mockProfile);
  });

  it('should list one page of sellers using only public card fields', async () => {
    const rows = [{ id: 's1', display_name: 'Anna', city: null, tagline: null, avatar_path: null }];

    const range = vi.fn().mockResolvedValue({ data: rows, error: null, count: 13 });
    const order = vi.fn();
    order.mockReturnValue({ order, range });
    const neq = vi.fn().mockReturnValue({ order });
    const not = vi.fn().mockReturnValue({ neq });
    const select = vi.fn().mockReturnValue({ not });

    mockFrom.mockReturnValue({ select });

    const result = await service.listSellers(2, 12);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id, display_name, city, tagline, avatar_path', {
      count: 'exact',
    });
    expect(not).toHaveBeenCalledWith('display_name', 'is', null);
    expect(neq).toHaveBeenCalledWith('display_name', '');
    expect(order).toHaveBeenCalledWith('display_name', { ascending: true });
    expect(range).toHaveBeenCalledWith(12, 23);
    expect(result.data).toEqual(rows);
    expect(result.count).toBe(13);
  });

  it('should update the correct user profile', async () => {
    const userId = 'test-user-123';

    const profileData = {
      display_name: 'Daniella',
      bio: 'Secondhand lover',
      city: 'Gothenburg',
      contact_email: 'test@example.com',
      instagram: '@meguru',
    };

    const single = vi.fn().mockResolvedValue({
      data: { id: userId, ...profileData },
      error: null,
    });

    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    mockFrom.mockReturnValue({ update });

    const result = await service.updateProfile(userId, profileData);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(profileData);
    expect(eq).toHaveBeenCalledWith('id', userId);
    expect(select).toHaveBeenCalled();
    expect(single).toHaveBeenCalled();
    expect(result.data).toEqual({ id: userId, ...profileData });
  });

  it('should create a seller profile', async () => {
    const profileData = {
      display_name: 'Daniella',
      bio: 'I love secondhand fashion',
      city: 'Gothenburg',
      contact_email: 'test@example.com',
      instagram: '@meguru',
    };

    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    mockFrom.mockReturnValue({ insert });

    const result = await service.createProfile(profileData);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(insert).toHaveBeenCalledWith(profileData);
    expect(result.error).toBeNull();
  });

  it('should return an error when updating a profile fails', async () => {
  const userId = 'test-user-123';

  const profileData = {
    display_name: 'Daniella',
    bio: null,
    city: null,
    contact_email: null,
    instagram: null,
  };

  const mockError = {
    message: 'No profile was updated',
  };

  const single = vi.fn().mockResolvedValue({
    data: null,
    error: mockError,
  });

  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });

  mockFrom.mockReturnValue({ update });

  const result = await service.updateProfile(userId, profileData);

  expect(result.data).toBeNull();
  expect(result.error).toEqual(mockError);
});
});
