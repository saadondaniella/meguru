import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
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
  imageErrorMessage = signal('');
  formErrorMessage = signal('');
  pageSuccessMessage = signal('');

  successPopup = signal<'published' | 'draft' | 'updated' | null>(null);

  // DELETE CONFIRMATION
  deleteTarget = signal<Listing | null>(null);
  deleteErrorMessage = signal('');
  isDeleting = signal(false);
  deleteDialog = viewChild<ElementRef<HTMLDivElement>>('deleteDialog');

  successCloseButton = viewChild<ElementRef<HTMLButtonElement>>('successCloseButton');
  private previousFocusedElement: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const button = this.successCloseButton();

      if (button) {
        button.nativeElement.focus();
      }
    });
  }

  private deleteTrigger: HTMLButtonElement | null = null;

  imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');

  // IMAGE SELECTION
  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.imageErrorMessage.set('');

    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !allowedTypes.includes(file.type.toLowerCase()) ||
      !extension ||
      !allowedExtensions.includes(extension)
    ) {
      this.imageErrorMessage.set('Please select a JPG, PNG or WebP image.');
      input.value = '';
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      this.imageErrorMessage.set('Image must be smaller than 5 MB.');
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

  // REMOVE SELECTED IMAGE
  onRemoveImage() {
    if (this.isUploading()) return;

    this.imageErrorMessage.set('');

    const previewUrl = this.imagePreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.imagePreviewUrl.set(null);
    }

    this.selectedImage = null;

    const input = this.imageInput();

    if (input) {
      input.nativeElement.value = '';
    }
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
    this.imageErrorMessage.set('');
    this.formErrorMessage.set('');
    this.listingForm.reset({
      title: '',
      description: '',
      price: null,
      category: 'budget',
      condition: 'good',
    });

    const previewUrl = this.imagePreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.imagePreviewUrl.set(null);
    }

    this.selectedImage = null;

    const input = this.imageInput();

    if (input) {
      input.nativeElement.value = '';
    }
  }

  // SAVE LISTING AS DRAFT
  async onSaveDraft() {
    if (this.isUploading()) return;
    this.formErrorMessage.set('');

    const editing = this.editingListing();

    // Never turn a published or sold listing into a draft.
    if (editing && editing.status !== 'draft') {
      this.formErrorMessage.set('Only drafts can be saved as drafts.');
      return;
    }

    const values = this.listingForm.getRawValue();

    // Drafts may be incomplete, but entered values must still be valid.
    if (
      values.title.length > 100 ||
      values.description.length > 2000 ||
      (values.price !== null && (!Number.isFinite(values.price) || values.price < 0))
    ) {
      this.formErrorMessage.set('Please check the title, description and price.');
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
        this.formErrorMessage.set('You must be logged in to save a draft.');
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
          this.formErrorMessage.set('Could not upload the image.');
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
          this.formErrorMessage.set('Could not update draft.');
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
        this.pageSuccessMessage.set('Your draft has been updated!');
        this.showSuccessPopup('draft');
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
          this.formErrorMessage.set('Could not save draft.');
          return;
        }

        console.log('Draft saved successfully:', draft);
        this.pageSuccessMessage.set('Your draft has been saved!');
        this.showSuccessPopup('draft');
      }

      this.editingListing.set(null);
      this.resetForm();
      this.isModalOpen.set(false);
      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error saving draft:', error);
      this.formErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  // CREATE OR UPDATE LISTING
  async onSubmit() {
    if (this.isUploading()) return;
    this.formErrorMessage.set('');

    if (this.listingForm.invalid) {
      this.listingForm.markAllAsTouched();
      return;
    }

    const values = this.listingForm.getRawValue();

    if (!values.title.trim()) {
      this.formErrorMessage.set('Please enter a title.');
      return;
    }

    this.isUploading.set(true);

    try {
      const { data: userData, error: userError } = await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        this.formErrorMessage.set('You must be logged in to manage listings.');
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
            this.formErrorMessage.set('Could not upload the new image.');
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

          this.formErrorMessage.set('Could not update listing.');
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

        this.pageSuccessMessage.set(
          editing.status === 'draft'
            ? 'Your listing has been published!'
            : 'Your changes have been saved!',
        );

        this.showSuccessPopup(editing.status === 'draft' ? 'published' : 'updated');

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
          this.formErrorMessage.set('Could not upload image.');
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

        this.formErrorMessage.set('Could not create listing.');
        return;
      }

      console.log('Listing created successfully:', listing);
      this.pageSuccessMessage.set('Your listing has been published!');
      this.showSuccessPopup('published');

      this.resetForm();
      this.isModalOpen.set(false);

      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error saving listing:', error);
      this.formErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  showSuccessPopup(type: 'published' | 'draft' | 'updated') {
    this.previousFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    this.successPopup.set(type);
  }

  closeSuccessPopup() {
    this.successPopup.set(null);
    this.pageSuccessMessage.set('');

    if (this.previousFocusedElement?.isConnected) {
      this.previousFocusedElement.focus();
    }

    this.previousFocusedElement = null;
  }

  // OPEN MODAL FOR A NEW LISTING
  onCreateListing() {
    if (this.isUploading()) return;
    this.formErrorMessage.set('');
    this.pageSuccessMessage.set('');

    this.editingListing.set(null);
    this.resetForm();
    this.isModalOpen.set(true);
  }

  // CLOSE MODAL
  onCloseModal() {
    if (this.isUploading()) return;
    this.formErrorMessage.set('');

    this.isModalOpen.set(false);
    this.editingListing.set(null);
    this.resetForm();
  }

  // START EDITING
  onEditListing(listing: Listing) {
    if (this.isUploading()) return;
    this.formErrorMessage.set('');
    this.pageSuccessMessage.set('');

    this.imageErrorMessage.set('');

    this.editingListing.set(listing);

    this.selectedImage = null;

    const previewUrl = this.imagePreviewUrl();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.imagePreviewUrl.set(null);
    }

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
    this.formErrorMessage.set('');

    this.editingListing.set(null);
    this.resetForm();
    this.isModalOpen.set(false);
  }

  // OPEN DELETE CONFIRMATION — no database changes yet
  onDeleteListing(listingId: string, event?: Event) {
    if (this.isUploading() || this.isDeleting()) return;

    const listing = this.listings().find((item) => item.id === listingId);
    if (!listing) return;

    this.deleteTrigger =
      event?.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    this.deleteErrorMessage.set('');
    this.deleteTarget.set(listing);

    // Wait for Angular to render the dialog before moving keyboard focus.
    setTimeout(() => {
      this.deleteDialog()
        ?.nativeElement.querySelector<HTMLButtonElement>('[data-delete-cancel]')
        ?.focus();
    }, 0);
  }

  // CLOSE DELETE CONFIRMATION
  onCancelDelete() {
    if (this.isDeleting()) return;
    this.deleteTarget.set(null);
    this.deleteErrorMessage.set('');

    const trigger = this.deleteTrigger;
    this.deleteTrigger = null;
    queueMicrotask(() => trigger?.isConnected && trigger.focus());
  }

  // ESC closes; TAB stays inside the confirmation dialog
  onDeleteDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancelDelete();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = this.deleteDialog()?.nativeElement;
    if (!dialog) return;

    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;

    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // DELETE ONLY AFTER EXPLICIT CONFIRMATION
  async onConfirmDelete() {
    const listing = this.deleteTarget();
    if (!listing || this.isDeleting() || this.isUploading()) return;

    this.isDeleting.set(true);
    this.deleteErrorMessage.set('');

    try {
      const { error } = await this.listingService.deleteListing(listing.id);

      if (error) {
        console.error('Error deleting listing:', error);
        this.deleteErrorMessage.set('Could not delete listing. Please try again.');
        return;
      }

      // Database deletion succeeded; clean up the image afterward.
      if (listing.image_path) {
        const { error: imageError } = await this.listingService.deleteListingImage(
          listing.image_path,
        );
        if (imageError) {
          console.error('Error deleting listing image:', imageError);
        }
      }

      if (this.editingListing()?.id === listing.id) {
        this.editingListing.set(null);
        this.resetForm();
        this.isModalOpen.set(false);
      }

      this.deleteTarget.set(null);
      this.deleteTrigger = null;
      this.pageSuccessMessage.set('Your listing has been deleted.');
      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error deleting listing:', error);
      this.deleteErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isDeleting.set(false);
    }
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
