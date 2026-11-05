import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect } from 'vitest';
import { SellerCard, SellerResult } from './seller-card';

describe('SellerCard', () => {
  let fixture: ComponentFixture<SellerCard>;

  async function create(seller: SellerResult) {
    await TestBed.configureTestingModule({
      imports: [SellerCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerCard);
    fixture.componentRef.setInput('seller', seller);
    fixture.detectChanges();
  }

  it('links to the storefront and shows avatar, name, city and tagline', async () => {
    await create({
      id: 's1',
      display_name: 'Daniella',
      city: 'Gothenburg',
      tagline: 'Worth keeping.',
      avatarUrl: 'https://example.com/a.png',
    });

    const card = fixture.nativeElement.querySelector('a.seller-card') as HTMLElement;

    expect(card.getAttribute('href')).toBe('/sellers/s1');
    expect(card.textContent).toContain('Daniella');
    expect(card.textContent).toContain('Gothenburg');
    expect(card.textContent).toContain('Worth keeping.');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(card.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('falls back to the initial and omits missing city and tagline', async () => {
    await create({
      id: 's2',
      display_name: 'dana',
      city: null,
      tagline: null,
      avatarUrl: null,
    });

    const card = fixture.nativeElement.querySelector('a.seller-card') as HTMLElement;

    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.seller-card-avatar')?.textContent?.trim()).toBe('D');
    expect(card.querySelector('.seller-card-city')).toBeNull();
    expect(card.querySelector('.seller-card-tagline')).toBeNull();
  });
});
