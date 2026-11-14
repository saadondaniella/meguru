import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Checkout } from './checkout';

describe('Checkout', () => {
  let component: Checkout;
  let fixture: ComponentFixture<Checkout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        {
          provide: SUPABASE_CLIENT,
          useValue: {
            functions: {
              invoke: vi.fn(),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Checkout);

    // Required inputs
    fixture.componentRef.setInput('listingId', 'test-listing-123');
    fixture.componentRef.setInput('listingTitle', 'Vintage jacket');
    fixture.componentRef.setInput('listingPrice', 350);

    component = fixture.componentInstance;

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
