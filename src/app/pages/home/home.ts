import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Auth } from '../../services/auth';
import { ListingService } from '../../services/listing';
import { ListingCategory } from '../../models/listing';

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private router = inject(Router);
  private supabase = inject(SUPABASE_CLIENT);
  private auth = inject(Auth);
  readonly isLoggedIn = this.auth.isLoggedIn;

  search = signal('');

  private listingService = inject(ListingService);

  collectionImages = signal<Record<ListingCategory, string | null>>({
    exclusive: null,
    budget: null,
    free: null,
  });

  async ngOnInit() {
    const categories: ListingCategory[] = ['exclusive', 'budget', 'free'];

    await Promise.all(
      categories.map(async (category) => {
        const { data, error } = await this.listingService.getLatestCollectionListing(category);

        if (error) {
          console.error(`Could not load ${category} collection image:`, error);
          return;
        }

        if (data?.image_path) {
          this.collectionImages.update((images) => ({
            ...images,
            [category]: this.listingService.getListingImageUrl(data.image_path),
          }));
        }
      }),
    );
  }

  onSearch() {
    const term = this.search().trim();

    if (!term) return;

    this.router.navigate(['/marketplace'], {
      queryParams: { search: term },
    });
  }

  async goToMyProfile() {
    const { data, error } = await this.supabase.auth.getUser();

    if (error || !data.user) {
      await this.router.navigate(['/login']);
      return;
    }

    await this.router.navigate(['/sellers', data.user.id]);
  }
}
