import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { SUPABASE_CLIENT } from '../../services/supabase';

type DeliveryMethod = 'shipping' | 'pickup';

type CheckoutResponse = {
  reservationId: string;
  checkoutUrl: string;
};

@Component({
  imports: [A11yModule],
  selector: 'app-checkout',
  styleUrl: './checkout.css',
  templateUrl: './checkout.html',
})
export class Checkout implements AfterViewInit {
  private supabase = inject(SUPABASE_CLIENT);

  // Information passed from ListingDetail
  listingId = input.required<string>();
  listingTitle = input.required<string>();
  listingPrice = input.required<number>();

  // Tell the parent component when the dialog should close
  closed = output<void>();

  // Selected delivery method
  deliveryMethod = signal<DeliveryMethod | null>(null);

  // Checkout state
  checkoutPending = signal(false);
  checkoutError = signal('');

  // Close the checkout dialog
  closeCheckout() {
    if (this.checkoutPending()) return;

    this.closed.emit();
  }

  // Update the selected delivery method
  selectDeliveryMethod(method: DeliveryMethod) {
    if (this.checkoutPending()) return;

    this.deliveryMethod.set(method);
    this.checkoutError.set('');
  }

  // Create a reservation and redirect to Stripe Checkout
  async continueToPayment() {
    const deliveryMethod = this.deliveryMethod();

    if (!deliveryMethod || this.checkoutPending()) return;

    this.checkoutPending.set(true);
    this.checkoutError.set('');

    try {
      const { data, error } = await this.supabase.functions.invoke<CheckoutResponse>(
        'create-checkout-session',
        {
          body: {
            listingId: this.listingId(),
            deliveryMethod,
          },
        },
      );

      if (error) {
        console.error('Checkout failed:', error);
        this.checkoutError.set('Could not start checkout. Please try again.');
        return;
      }

      if (!data?.checkoutUrl) {
        this.checkoutError.set('No payment link was returned. Please try again.');
        return;
      }

      // Stripe Checkout is hosted on a separate page.
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      console.error('Unexpected checkout error:', error);

      this.checkoutError.set('Something went wrong. Please try again.');
    } finally {
      this.checkoutPending.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeCheckout();
  }

  closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');

  ngAfterViewInit() {
    this.closeButton().nativeElement.focus();
  }
}
