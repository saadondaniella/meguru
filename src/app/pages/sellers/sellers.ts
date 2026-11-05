import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Profile } from '../../services/profile';
import { SellerCard, SellerResult } from '../../components/seller-card/seller-card';

@Component({
  selector: 'app-sellers',
  imports: [RouterLink, SellerCard],
  templateUrl: './sellers.html',
  styleUrl: './sellers.css',
})
export class Sellers implements OnInit {
  private profileService = inject(Profile);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private title = inject(Title);

  readonly pageSize = 12;

  readonly sellers = signal<SellerResult[]>([]);
  readonly currentPage = signal(1);
  readonly totalSellers = signal(0);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  readonly totalPages = computed(() => Math.ceil(this.totalSellers() / this.pageSize));
  readonly pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  async ngOnInit() {
    this.title.setTitle('Explore Sellers | MEGURU');

    const pageParam = Number(this.route.snapshot.queryParamMap.get('page'));
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    await this.load(page);
  }

  async load(page = this.currentPage()) {
    this.isLoading.set(true);
    this.hasError.set(false);

    try {
      const { data, error, count } = await this.profileService.listSellers(page, this.pageSize);

      if (error) {
        console.error('Error fetching sellers:', error);
        this.hasError.set(true);
        return;
      }

      const total = count ?? 0;

      // A stale or hand-edited ?page= beyond the last page: fall back to the last one.
      if ((data ?? []).length === 0 && total > 0 && page > 1) {
        await this.load(Math.ceil(total / this.pageSize));
        return;
      }

      this.sellers.set(
        (data ?? []).map((seller) => ({
          id: seller.id,
          display_name: seller.display_name,
          city: seller.city?.trim() || null,
          tagline: seller.tagline?.trim() || null,
          avatarUrl: this.profileService.getAvatarUrl(seller.avatar_path ?? null),
        })),
      );
      this.totalSellers.set(total);
      this.currentPage.set(page);
    } catch (error) {
      console.error('Error fetching sellers:', error);
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  async changePage(page: number) {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;

    await this.load(page);

    if (this.hasError()) return;

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
