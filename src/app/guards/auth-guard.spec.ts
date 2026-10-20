import { TestBed } from '@angular/core/testing';
import { CanActivateFn, provideRouter, Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { authGuard } from './auth-guard';
import { SUPABASE_CLIENT } from '../services/supabase';

describe('authGuard', () => {
  const mockGetUser = vi.fn();

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  beforeEach(() => {
    mockGetUser.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            auth: {
              getUser: mockGetUser,
            },
          },
        },
      ],
    });
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should redirect to login when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const router = TestBed.inject(Router);
    const result = await executeGuard({} as any, {} as any);

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('should allow access when user is authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: 'test-user-123' },
      },
      error: null,
    });

    const result = await executeGuard({} as any, {} as any);

    expect(mockGetUser).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });
});
