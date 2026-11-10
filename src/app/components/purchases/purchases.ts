import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { Orders } from '../../services/orders';
import { Auth } from '../../services/auth';
import { RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';

@Component({
  selector: 'app-purchases',
  imports: [RouterLink],
  templateUrl: './purchases.html',
  styleUrl: './purchases.css',
})
export class Purchases implements OnInit {
  private ordersService = inject(Orders);
  private auth = inject(Auth);
  private listingService = inject(ListingService);

  private purchasesList = viewChild<ElementRef<HTMLUListElement>>('purchasesList');

  purchases = signal<any[]>([]);
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

      await this.loadPurchases(session.user.id);
    } catch (error) {
      console.error('Failed to load purchases:', error);
      this.errorMessage.set('Could not load your purchases.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadPurchases(userId: string) {
    const { data, error } = await this.ordersService.getMyPurchases(userId);

    if (error) {
      throw error;
    }

    this.purchases.set(data ?? []);
  }

  getImageUrl(imagePath: string | null): string | null {
    if (!imagePath) return null;

    return this.listingService.getListingImageUrl(imagePath);
  }

  scrollPurchases(direction: number) {
    const list = this.purchasesList()?.nativeElement;

    if (!list) return;

    const card = list.querySelector<HTMLElement>('.purchase-item');

    if (!card) return;

    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;

    list.scrollBy({
      left: direction * (card.getBoundingClientRect().width + gap),
      behavior: 'smooth',
    });
  }
}
