import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sellers } from './sellers';
import { Profile } from '../../services/profile';

describe('Sellers', () => {
  let fixture: ComponentFixture<Sellers>;

  const listSellers = vi.fn();

  const row = (id: string, name: string) => ({
    id,
    display_name: name,
    city: null,
    tagline: null,
    avatar_path: null,
  });

  async function create(query: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [Sellers],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
        {
          provide: Profile,
          useValue: {
            listSellers,
            getAvatarUrl: vi.fn((path: string | null) =>
              path ? `https://example.com/avatars/${path}` : null,
            ),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sellers);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    listSellers.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows a loading state before the sellers arrive', async () => {
    listSellers.mockReturnValue(new Promise(() => undefined));

    await TestBed.configureTestingModule({
      imports: [Sellers],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: Profile, useValue: { listSellers, getAvatarUrl: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sellers);
    fixture.detectChanges();

    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading sellers');
  });

  it('renders each seller as a card linking to the storefront', async () => {
    listSellers.mockResolvedValue({
      data: [row('s1', 'Anna'), { ...row('s2', 'Bo'), city: ' Malmö ', tagline: '  ' }],
      error: null,
      count: 2,
    });

    await create();

    const cards = el().querySelectorAll('a.seller-card');

    expect(listSellers).toHaveBeenCalledWith(1, 12);
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('href')).toBe('/sellers/s1');
    expect(cards[1].textContent).toContain('Malmö');
    expect(cards[1].querySelector('.seller-card-tagline')).toBeNull();
    expect(el().querySelector('nav.pagination')).toBeNull();
  });

  it('shows an empty state with a link to the marketplace', async () => {
    listSellers.mockResolvedValue({ data: [], error: null, count: 0 });

    await create();

    expect(el().textContent).toContain('No sellers yet');
    expect(el().querySelector('a[href="/marketplace"]')).not.toBeNull();
    expect(el().querySelector('a.seller-card')).toBeNull();
  });

  it('shows an error and retries', async () => {
    listSellers.mockResolvedValueOnce({ data: null, error: { message: 'boom' }, count: null });

    await create();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain("couldn't load");

    listSellers.mockResolvedValueOnce({ data: [row('s1', 'Anna')], error: null, count: 1 });

    (el().querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(el().querySelectorAll('a.seller-card')).toHaveLength(1);
  });

  it('paginates and loads the requested page', async () => {
    listSellers.mockResolvedValue({ data: [row('s13', 'Zed')], error: null, count: 13 });

    await create({ page: '2' });

    expect(listSellers).toHaveBeenCalledWith(2, 12);
    expect(el().querySelectorAll('nav.pagination button[aria-current="page"]')).toHaveLength(1);
    expect(el().querySelector('nav.pagination button[aria-current="page"]')?.textContent).toContain(
      '2',
    );
  });

  it('falls back to the last page when ?page= is out of range', async () => {
    listSellers
      .mockResolvedValueOnce({ data: [], error: null, count: 13 })
      .mockResolvedValueOnce({ data: [row('s13', 'Zed')], error: null, count: 13 });

    await create({ page: '9' });
    await vi.waitFor(() => expect(fixture.componentInstance.isLoading()).toBe(false));
    fixture.detectChanges();

    expect(listSellers).toHaveBeenLastCalledWith(2, 12);
    expect(el().querySelectorAll('a.seller-card')).toHaveLength(1);
  });
});
