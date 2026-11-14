import { Component, inject, OnInit, signal } from '@angular/core';
import { Orders } from '../../services/orders';
import { Auth } from '../../services/auth';
import { ListingService } from '../../services/listing';

@Component({
  selector: 'app-sales',
  imports: [],
  templateUrl: './sales.html',
  styleUrl: './sales.css',
})
export class Sales implements OnInit {
  private ordersService = inject(Orders);
  private auth = inject(Auth);
  private listingService = inject(ListingService);

  sales = signal<any[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  async ngOnInit() {
    try {
      const {
        data: { session },
        error,
      } = await this.auth.getSession();

      if (error || !session) {
        throw new Error('Unable to get user session');
      }

      const { data, error: salesError } = await this.ordersService.getMySales(session.user.id);

      if (salesError) {
        throw salesError;
      }

      this.sales.set(data ?? []);
    } catch (error) {
      console.error('Failed to load sales:', error);
      this.errorMessage.set('Could not load your sales.');
    } finally {
      this.isLoading.set(false);
    }
  }

  getImageUrl(imagePath: string | null): string | null {
    if (!imagePath) return null;

    return this.listingService.getListingImageUrl(imagePath);
  }

  async onMarkAsShipped(sale: any) {
    if (
      sale.status !== 'paid' ||
      sale.delivery_method !== 'shipping' ||
      !sale.listings ||
      sale.listings.is_shipped
    ) {
      return;
    }

    try {
      const { error } = await this.listingService.updateListing(sale.listing_id, {
        is_shipped: true,
      });

      if (error) {
        throw error;
      }

      this.sales.update((sales) =>
        sales.map((item) =>
          item.id === sale.id
            ? {
                ...item,
                listings: { ...item.listings, is_shipped: true },
              }
            : item,
        ),
      );

      this.errorMessage.set('');
    } catch (error) {
      console.error('Could not mark order as shipped:', error);
      this.errorMessage.set('Could not update shipping status. Please try again.');
    }
  }
}
