import { Component, ElementRef, input, model, OnDestroy, signal, viewChild } from '@angular/core';
import {
  ListingImageItem,
  MAX_LISTING_IMAGES,
  validateNewImages,
} from '../../../../models/listing-image';

@Component({
  selector: 'app-listing-image-picker',
  templateUrl: './listing-image-picker.html',
  styleUrl: './listing-image-picker.css',
})
export class ListingImagePicker implements OnDestroy {
  // Ordered images; the first one is the main image.
  images = model<ListingImageItem[]>([]);
  disabled = input(false);
  loading = input(false);

  readonly maxImages = MAX_LISTING_IMAGES;
  errorMessage = signal('');

  private fileInput = viewChild.required<ElementRef<HTMLInputElement>>('imageInput');

  ngOnDestroy() {
    for (const image of this.images()) {
      this.revokePreview(image);
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    input.value = '';
    this.errorMessage.set('');

    if (files.length === 0) return;

    const error = validateNewImages(files, this.images().length);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    const added: ListingImageItem[] = files.map((file) => ({
      kind: 'new',
      key: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));

    this.images.update((images) => [...images, ...added]);
  }

  setMain(key: string) {
    this.errorMessage.set('');

    this.images.update((images) => {
      const selected = images.find((image) => image.key === key);

      return selected ? [selected, ...images.filter((image) => image.key !== key)] : images;
    });
  }

  remove(key: string) {
    const removed = this.images().find((image) => image.key === key);

    if (!removed) return;

    this.revokePreview(removed);
    this.errorMessage.set('');
    // Removing the main image promotes the next one automatically.
    this.images.update((images) => images.filter((image) => image.key !== key));

    // The removed button disappears, so keep keyboard focus inside the picker.
    this.fileInput().nativeElement.focus();
  }

  private revokePreview(image: ListingImageItem) {
    if (image.kind === 'new') {
      URL.revokeObjectURL(image.url);
    }
  }
}
