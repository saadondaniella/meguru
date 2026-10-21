import { Component, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ListingService } from '../../services/listing';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Listing, ListingCategory, ListingCondition } from '../../models/listing';

@Component({
  selector: 'app-listing-management',
  imports: [ReactiveFormsModule],
  templateUrl: './listing-management.html',
  styleUrl: './listing-management.css',
})
export class ListingManagement implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SUPABASE_CLIENT);
  listingService = inject(ListingService);

  listingForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(2000)],
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    category: ['budget', Validators.required],
    condition: ['good', Validators.required],
  });

  selectedImage: File | null = null;

  listings = signal<Listing[]>([]);
  isUploading = signal(false);

  // IMAGE SELECTION
  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.selectedImage = null;

    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !allowedTypes.includes(file.type.toLowerCase()) ||
      !extension ||
      !allowedExtensions.includes(extension)
    ) {
      alert('Please select a JPG, PNG or WebP image.');
      input.value = '';
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      alert('Image must be smaller than 5 MB.');
      input.value = '';
      return;
    }

    this.selectedImage = file;

    console.log('Selected image:', file.name);
    console.log('File type:', file.type);
  }

  // CATEGORY AND PRICE
  onCategoryChange() {
    const category = this.listingForm.controls.category.value;
    const priceControl = this.listingForm.controls.price;

    if (category === 'free') {
      priceControl.setValue(0);
    } else if (priceControl.value === 0) {
      priceControl.setValue(null);
    }
  }

  // CREATE LISTING
  async onSubmit() {
    // Prevent duplicate submissions
    if (this.isUploading()) return;

    if (this.listingForm.invalid) {
      this.listingForm.markAllAsTouched();
      return;
    }

    const formValues = this.listingForm.getRawValue();

    if (!formValues.title.trim()) {
      alert('Please enter a title.');
      return;
    }

    // Start loading
    this.isUploading.set(true);

    try {
      // Get authenticated user
      const { data, error } = await this.supabase.auth.getUser();

      if (error || !data.user) {
        alert('You must be logged in to create a listing.');
        return;
      }

      let imagePath: string | null = null;

      // Upload image to Supabase Storage
      if (this.selectedImage) {
        const { data: imageData, error: imageError } = await this.listingService.uploadListingImage(
          data.user.id,
          this.selectedImage,
        );

        if (imageError) {
          console.error('Image upload failed:', imageError);
          alert('Could not upload image.');
          return;
        }

        imagePath = imageData.path;

        console.log('Image uploaded successfully:', imagePath);
      }

      // Save listing to database
      const { data: listing, error: listingError } = await this.listingService.createListing({
        seller_id: data.user.id,
        title: formValues.title.trim(),
        description: formValues.description.trim() || null,
        price: formValues.category === 'free' ? 0 : formValues.price!,
        category: formValues.category as ListingCategory,
        condition: formValues.condition as ListingCondition,
        image_path: imagePath,
      });

      if (listingError) {
        console.error('Error creating listing:', listingError);
        alert('Could not create listing.');
        return;
      }

      console.log('Listing created successfully:', listing);

      // Refresh listings
      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error creating listing:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      // Always stop loading, even if something fails
      this.isUploading.set(false);
    }
  }

  // INITIAL LOAD
  ngOnInit() {
    void this.loadListings();
  }

  // GET SELLER LISTINGS
  async loadListings() {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      console.error('Could not get authenticated user:', userError);
      return;
    }

    const { data, error } = await this.listingService.getListingsBySeller(userData.user.id);

    if (error) {
      console.error('Could not load listings:', error);
      return;
    }

    this.listings.set(data as Listing[]);

    console.log('My listings:', this.listings());
  }
}
