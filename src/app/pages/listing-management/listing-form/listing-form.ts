import { Component, inject, input, model, OnInit, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ListingService } from '../../../services/listing';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import {
  Listing,
  ListingCategory,
  ListingCondition,
  ListingSizeType,
} from '../../../models/listing';
import { ListingImageItem } from '../../../models/listing-image';
import { ListingImagePicker } from './listing-image-picker/listing-image-picker';

export type ListingSavedType = 'published' | 'draft' | 'updated';

type ListingFields = {
  title: string | null;
  description: string | null;
  price: number | null;
  category: ListingCategory;
  condition: ListingCondition;
  brand: string | null;
  size_type: ListingSizeType | null;
  size: string | null;
};

@Component({
  selector: 'app-listing-form',
  imports: [ReactiveFormsModule, ListingImagePicker],
  templateUrl: './listing-form.html',
  styleUrl: './listing-form.css',
})
export class ListingForm implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SUPABASE_CLIENT);

  listingService = inject(ListingService);

  // Listing being edited, or null when creating a new one.
  listing = input<Listing | null>(null);
  isUploading = model(false);

  saved = output<ListingSavedType>();
  closed = output<void>();

  listingForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(2000)],
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    category: ['budget', Validators.required],
    condition: ['good', Validators.required],
    brand: ['', Validators.maxLength(100)],
    size_type: [null as ListingSizeType | null],
    size: [null as string | null],
  });

  constructor() {
    this.listingForm.controls.size.disable();

    this.listingForm.controls.size_type.valueChanges.subscribe((type) => {
      this.listingForm.controls.size.setValue(null);

      if (type) {
        this.listingForm.controls.size.enable();
      } else {
        this.listingForm.controls.size.disable();
      }
    });
  }

  formErrorMessage = signal('');

  // Ordered images; the first one is the main image.
  images = signal<ListingImageItem[]>([]);
  isLoadingImages = signal(false);

  // Block saving if existing images could not be loaded.
  imagesLoadFailed = signal(false);

  private initialImagePaths: string[] = [];

  ngOnInit() {
    const listing = this.listing();

    if (listing) {
      this.listingForm.patchValue(
        {
          title: listing.title ?? '',
          description: listing.description ?? '',
          price: listing.price,
          category: listing.category ?? 'budget',
          condition: listing.condition ?? 'good',
          brand: listing.brand ?? '',
          size_type: listing.size_type ?? null,
          size: listing.size ?? null,
        },
        { emitEvent: false },
      );

      if (listing.size_type) {
        this.listingForm.controls.size.enable({ emitEvent: false });
      }

      void this.loadExistingImages(listing);
    }
  }

  private async loadExistingImages(listing: Listing) {
    this.isLoadingImages.set(true);

    const { data: paths, error } = await this.listingService.getListingImagePaths(listing);

    this.isLoadingImages.set(false);

    if (error || !paths) {
      console.error('Could not load listing images:', error);
      this.imagesLoadFailed.set(true);
      this.formErrorMessage.set(
        'Could not load the listing images. Close and reopen the form to try again.',
      );
      return;
    }

    this.initialImagePaths = paths;

    this.images.set(
      paths.map((imagePath) => ({
        kind: 'existing',
        key: imagePath,
        imagePath,
        url: this.listingService.getListingImageUrl(imagePath),
      })),
    );
  }

  // CLOSE (blocked while saving)
  onClose() {
    if (this.isUploading()) return;
    this.closed.emit();
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

  // SAVE LISTING AS DRAFT
  async onSaveDraft() {
    if (this.isUploading() || this.isLoadingImages()) return;

    this.formErrorMessage.set('');

    const editing = this.listing();

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
      values.brand.length > 100 ||
      (values.price !== null && (!Number.isFinite(values.price) || values.price < 0))
    ) {
      this.formErrorMessage.set('Please check the title, description, price and brand.');
      return;
    }

    await this.save(
      {
        title: values.title.trim() || null,
        description: values.description.trim() || null,
        price: values.category === 'free' ? 0 : values.price,
        category: values.category as ListingCategory,
        condition: values.condition as ListingCondition,
        brand: values.brand.trim() || null,
        size_type: values.size_type && values.size ? values.size_type : null,
        size: values.size_type && values.size ? values.size : null,
      },
      'draft',
    );
  }

  // CREATE OR UPDATE LISTING
  async onSubmit() {
    if (this.isUploading() || this.isLoadingImages()) return;

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

    await this.save(
      {
        title: values.title.trim(),
        description: values.description.trim() || null,
        price: values.category === 'free' ? 0 : values.price!,
        category: values.category as ListingCategory,
        condition: values.condition as ListingCondition,
        brand: values.brand.trim() || null,
        size_type: values.size_type && values.size ? values.size_type : null,
        size: values.size_type && values.size ? values.size : null,
      },
      'published',
    );
  }

  private async save(fields: ListingFields, targetStatus: 'draft' | 'published') {
    if (this.imagesLoadFailed()) {
      this.formErrorMessage.set('The listing images could not be loaded, so nothing was saved.');
      return;
    }

    this.isUploading.set(true);

    try {
      const { data: userData, error: userError } = await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        this.formErrorMessage.set('You must be logged in to manage listings.');
        return;
      }

      const editing = this.listing();
      const userId = userData.user.id;

      const savedType = editing
        ? await this.updateExisting(editing, userId, fields, targetStatus)
        : await this.createNew(userId, fields, targetStatus);

      if (savedType) {
        this.saved.emit(savedType);
      }
    } catch (error) {
      console.error('Unexpected error saving listing:', error);
      this.formErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isUploading.set(false);
    }
  }

  // CREATE NEW LISTING
  private async createNew(
    userId: string,
    fields: ListingFields,
    status: 'draft' | 'published',
  ): Promise<ListingSavedType | null> {
    const { data: listing, error: createError } = await this.listingService.createListing({
      seller_id: userId,
      ...fields,
      image_path: null,
      status,
    });

    if (createError || !listing) {
      console.error('Could not create listing:', createError);
      this.formErrorMessage.set(
        status === 'draft' ? 'Could not save draft.' : 'Could not create listing.',
      );
      return null;
    }

    if (this.images().length > 0) {
      const { error: imageError } = await this.listingService.saveListingImages(
        listing.id,
        userId,
        this.images(),
      );

      if (imageError) {
        console.error('Could not save images, rolling back listing:', imageError);

        const { error: rollbackError } = await this.listingService.deleteListing(listing.id);

        this.formErrorMessage.set(
          rollbackError
            ? 'The listing was created, but its images could not be saved. Please check your listings.'
            : 'Could not save the images. Nothing was saved, please try again.',
        );

        return null;
      }
    }

    return status;
  }

  // UPDATE EXISTING LISTING
  private async updateExisting(
    editing: Listing,
    userId: string,
    fields: ListingFields,
    targetStatus: 'draft' | 'published',
  ): Promise<ListingSavedType | null> {
    // Save images first to avoid publishing with a half-saved image set.
    if (this.imagesChanged()) {
      const { error: imageError } = await this.listingService.saveListingImages(
        editing.id,
        userId,
        this.images(),
      );

      if (imageError) {
        console.error('Could not save images:', imageError);
        this.formErrorMessage.set('Could not save the images. Your listing was not changed.');
        return null;
      }
    }

    const publishing = editing.status === 'draft' && targetStatus === 'published';

    const { error: updateError } = await this.listingService.updateListing(editing.id, {
      ...fields,
      ...(publishing ? { status: 'published' as const } : {}),
    });

    if (updateError) {
      console.error('Error updating listing:', updateError);

      this.formErrorMessage.set(
        this.imagesChanged()
          ? 'Your images were saved, but the listing details could not be updated. Please try again.'
          : 'Could not update listing.',
      );

      return null;
    }

    if (editing.status === 'draft') {
      return targetStatus === 'published' ? 'published' : 'draft';
    }

    return 'updated';
  }

  // Check whether the ordered image set has changed.
  private imagesChanged(): boolean {
    const current = this.images();

    return (
      current.length !== this.initialImagePaths.length ||
      current.some(
        (image, i) => image.kind === 'new' || image.imagePath !== this.initialImagePaths[i],
      )
    );
  }
}
