export const MAX_LISTING_IMAGES = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// One entry in the form's ordered image list. The first entry is the main image.
export type ListingImageItem =
  | { kind: 'existing'; key: string; imagePath: string; url: string }
  | { kind: 'new'; key: string; file: File; url: string };

export function getFileExtension(fileName: string): string | undefined {
  return fileName.split('.').pop()?.toLowerCase();
}

// Returns an error message, or null when the files can be added.
export function validateNewImages(files: File[], currentCount: number): string | null {
  if (currentCount + files.length > MAX_LISTING_IMAGES) {
    const remaining = Math.max(0, MAX_LISTING_IMAGES - currentCount);
    return remaining === 0
      ? `A listing can have a maximum of ${MAX_LISTING_IMAGES} images.`
      : `You can add ${remaining} more image${remaining === 1 ? '' : 's'} (maximum ${MAX_LISTING_IMAGES}).`;
  }

  for (const file of files) {
    const extension = getFileExtension(file.name);

    if (
      !ALLOWED_TYPES.includes(file.type.toLowerCase()) ||
      !extension ||
      !ALLOWED_EXTENSIONS.includes(extension)
    ) {
      return `"${file.name}" is not supported. Please select JPG, PNG or WebP images.`;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `"${file.name}" is larger than 5 MB.`;
    }
  }

  return null;
}
