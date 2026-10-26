import { Component, inject, OnInit, signal, computed, viewChild, ElementRef } from '@angular/core';
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

  publishedListings = computed(() =>
    this.listings().filter((listing) => listing.status === 'published'),
  );

  draftListings = computed(() => this.listings().filter((listing) => listing.status === 'draft'));

  soldListings = computed(() => this.listings().filter((listing) => listing.status === 'sold'));

  isUploading = signal(false);
  editingListing = signal<Listing | null>(null);

  isModalOpen = signal(false);

  imagePreviewUrl = signal<string | null>(null);

  imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');

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

    // Remove previous preview URL to avoid memory leaks
    const previousPreview = this.imagePreviewUrl();

    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }

    // Create a temporary preview of the selected image
    const previewUrl = URL.createObjectURL(file);

    this.imagePreviewUrl.set(previewUrl);

    console.log('Selected image:', file.name);
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

  // RESET FORM
  resetForm() {
    this.listingForm.reset({
      title: '',
      description: '',
      price: null,
      category: 'budget',
      condition: 'good',
    });

    this.selectedImage = null;

    const input = this.imageInput();

    if (input) {
      input.nativeElement.value = '';
    }
  }

  // SAVE LISTING AS DRAFT
  async onSaveDraft() {
    if (this.isUploading()) return;

    const editing = this.editingListing();

    // Never turn a published or sold listing into a draft.
    if (editing && editing.status !== 'draft') {
      alert('Only drafts can be saved as drafts.');
      return;
    }

    const values = this.listingForm.getRawValue();

    // Drafts may be incomplete, but entered values must still be valid.
    if (
      values.title.length > 100 ||
      values.description.length > 2000 ||
      (values.price !== null && (!Number.isFinite(values.price) || values.price < 0))
    ) {
      alert('Please check the title, description and price.');
      return;
    }

    const draftValues = {
      title: values.title.trim() || null,
      description: values.description.trim() || null,
      price: values.category === 'free' ? 0 : values.price,
      category: values.category as ListingCategory,
      condition: values.condition as ListingCondition,
      status: 'draft' as const,
    };

    this.isUploading.set(true);
    let newImagePath: string | null = null;

    try {
      const { data: userData, error: userError } = await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        alert('You must be logged in to save a draft.');
        return;
      }

      const userId = userData.user.id;

      // Upload a new image only when the seller has selected one.
      if (this.selectedImage) {
        const { data: imageData, error: imageError } = await this.listingService.uploadListingImage(
          userId,
          this.selectedImage,
        );

        if (imageError) {
          console.error('Could not upload draft image:', imageError);
          alert('Could not upload the image.');
          return;
        }

        newImagePath = imageData.path;
      }

      if (editing) {
        // Updating a draft preserves its existing image unless replaced.
        const { error } = await this.listingService.updateListing(editing.id, {
          ...draftValues,
          ...(newImagePath ? { image_path: newImagePath } : {}),
        });

        if (error) {
          console.error('Could not update draft:', error);
          if (newImagePath) {
            await this.listingService.deleteListingImage(newImagePath);
          }
          alert('Could not update draft.');
          return;
        }

        // Remove the previous image only after the database update succeeds.
        if (newImagePath && editing.image_path) {
          const { error: cleanupError } = await this.listingService.deleteListingImage(
            editing.image_path,
          );
          if (cleanupError) console.error('Could not remove previous image:', cleanupError);
        }

        console.log('Draft updated successfully');
        alert('Draft updated successfully!');
      } else {
        const { data: draft, error } = await this.listingService.createListing({
          seller_id: userId,
          ...draftValues,
          image_path: newImagePath,
        });

        if (error) {
          console.error('Could not create draft:', error);
          if (newImagePath) {
            await this.listingService.deleteListingImage(newImagePath);
          }
          alert('Could not save draft.');
          return;
        }

        console.log('Draft saved successfully:', draft);
        alert('Draft saved successfully!');
      }

      this.editingListing.set(null);
      this.resetForm();
      this.isModalOpen.set(false);
      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error saving draft:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  // CREATE OR UPDATE LISTING
  async onSubmit() {
    if (this.isUploading()) return;

    if (this.listingForm.invalid) {
      this.listingForm.markAllAsTouched();
      return;
    }

    const values = this.listingForm.getRawValue();

    if (!values.title.trim()) {
      alert('Please enter a title.');
      return;
    }

    this.isUploading.set(true);

    try {
      const { data: userData, error: userError } = await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        alert('You must be logged in to manage listings.');
        return;
      }

      const userId = userData.user.id;
      const editing = this.editingListing();

      console.log('Editing existing listing:', editing);

      // Shared form values for Create and Update
      const listingValues = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        price: values.category === 'free' ? 0 : values.price!,
        category: values.category as ListingCategory,
        condition: values.condition as ListingCondition,
      };

      // UPDATE EXISTING LISTING
      if (editing) {
        let newImagePath: string | null = null;

        // Upload a replacement image if selected
        if (this.selectedImage) {
          const { data: imageData, error: imageError } =
            await this.listingService.uploadListingImage(userId, this.selectedImage);

          if (imageError) {
            console.error('Image upload failed:', imageError);
            alert('Could not upload the new image.');
            return;
          }

          newImagePath = imageData.path;
        }

        // Include the new image path only if a new image was uploaded
        const updates = {
          ...listingValues,
          ...(editing.status === 'draft' ? { status: 'published' as const } : {}),
          ...(newImagePath !== null ? { image_path: newImagePath } : {}),
        };

        const { error: updateError } = await this.listingService.updateListing(editing.id, updates);

        if (updateError) {
          console.error('Error updating listing:', updateError);

          // Remove newly uploaded image if database update failed
          if (newImagePath) {
            const { error: cleanupError } =
              await this.listingService.deleteListingImage(newImagePath);

            if (cleanupError) {
              console.error('Could not clean up new image:', cleanupError);
            }
          }

          alert('Could not update listing.');
          return;
        }

        // Remove old image after successful database update
        if (newImagePath && editing.image_path) {
          const { error: deleteError } = await this.listingService.deleteListingImage(
            editing.image_path,
          );

          if (deleteError) {
            console.error('Could not delete previous image:', deleteError);
          }
        }

        console.log('Listing updated successfully');

        this.editingListing.set(null);
        this.resetForm();
        this.isModalOpen.set(false);

        await this.loadListings();

        return;
      }

      // CREATE NEW LISTING
      let imagePath: string | null = null;

      if (this.selectedImage) {
        const { data: imageData, error: imageError } = await this.listingService.uploadListingImage(
          userId,
          this.selectedImage,
        );

        if (imageError) {
          console.error('Image upload failed:', imageError);
          alert('Could not upload image.');
          return;
        }

        imagePath = imageData.path;
      }

      const { data: listing, error: listingError } = await this.listingService.createListing({
        seller_id: userId,
        ...listingValues,
        image_path: imagePath,
      });

      if (listingError) {
        console.error('Error creating listing:', listingError);

        // Clean up uploaded image if listing creation failed
        if (imagePath) {
          const { error: cleanupError } = await this.listingService.deleteListingImage(imagePath);

          if (cleanupError) {
            console.error('Could not clean up uploaded image:', cleanupError);
          }
        }

        alert('Could not create listing.');
        return;
      }

      console.log('Listing created successfully:', listing);

      this.resetForm();
      this.isModalOpen.set(false);

      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error saving listing:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  // OPEN MODAL FOR A NEW LISTING
  onCreateListing() {
    if (this.isUploading()) return;

    this.editingListing.set(null);
    this.resetForm();
    this.isModalOpen.set(true);
  }

  // CLOSE MODAL
  onCloseModal() {
    if (this.isUploading()) return;

    this.isModalOpen.set(false);
    this.editingListing.set(null);
    this.resetForm();
  }

  // START EDITING
  onEditListing(listing: Listing) {
    if (this.isUploading()) return;

    this.editingListing.set(listing);

    this.selectedImage = null;

    const input = this.imageInput();

    if (input) {
      input.nativeElement.value = '';
    }

    this.listingForm.patchValue({
      title: listing.title ?? '',
      description: listing.description ?? '',
      price: listing.price,
      category: listing.category ?? 'budget',
      condition: listing.condition ?? 'good',
    });

    this.isModalOpen.set(true);
  }

  // CANCEL EDITING
  onCancelEdit() {
    if (this.isUploading()) return;

    this.editingListing.set(null);
    this.resetForm();
    this.isModalOpen.set(false);
  }

  // DELETE LISTING
  async onDeleteListing(listingId: string) {
    if (this.isUploading()) return;

    const confirmed = confirm('Are you sure you want to delete this listing?');

    if (!confirmed) return;

    const listing = this.listings().find((item) => item.id === listingId);

    if (!listing) return;

    const { error } = await this.listingService.deleteListing(listingId);

    if (error) {
      console.error('Error deleting listing:', error);
      alert('Could not delete listing.');
      return;
    }

    // Remove image after database deletion
    if (listing.image_path) {
      const { error: imageError } = await this.listingService.deleteListingImage(
        listing.image_path,
      );

      if (imageError) {
        console.error('Error deleting listing image:', imageError);
      }
    }

    // Exit edit mode if the deleted listing was being edited
    if (this.editingListing()?.id === listingId) {
      this.editingListing.set(null);
      this.resetForm();
    }

    await this.loadListings();
  }

  // INITIAL LOAD
  ngOnInit() {
    void this.loadListings();
  }

  // LOAD SELLER LISTINGS
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
