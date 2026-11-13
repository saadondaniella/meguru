import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Orders } from '../../services/orders';
import { Auth } from '../../services/auth';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ListingService } from '../../services/listing';
import { A11yModule } from '@angular/cdk/a11y';

@Component({
  selector: 'app-purchases',
  imports: [RouterLink, A11yModule],
  templateUrl: './purchases.html',
  styleUrl: './purchases.css',
})
export class Purchases implements OnInit {
  private ordersService = inject(Orders);
  private auth = inject(Auth);
  private listingService = inject(ListingService);

  private purchasesList = viewChild<ElementRef<HTMLUListElement>>('purchasesList');
  private route = inject(ActivatedRoute);

  purchases = signal<any[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');
  private checkoutSessionId: string | null = null;
  confirmedPurchase = signal<any | null>(null);

  async ngOnInit() {
    this.checkoutSessionId = this.route.snapshot.queryParamMap.get('session_id');
    try {
      const {
        data: { session },
        error,
      } = await this.auth.getSession();

      if (error || !session) {
        throw new Error('Unable to get user session');
      }

      await this.loadPurchases(session.user.id);
      await this.checkConfirmedPurchase(session.user.id);
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

  private async checkConfirmedPurchase(userId: string) {
    if (!this.checkoutSessionId) return;

    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data, error } = await this.ordersService.getPurchaseBySessionId(
        userId,
        this.checkoutSessionId,
      );

      if (error) {
        console.error('Failed to check checkout order:', error);
        this.errorMessage.set('Could not verify your purchase.');
        return;
      }

      if (data) {
        await this.loadPurchases(userId);

        this.confirmedPurchase.set(data);
        return;
      }

      await this.wait(1500);
    }

    console.warn('Order confirmation is still pending.');
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmedPurchase()) {
      this.confirmedPurchase.set(null);
    }
  }
}
