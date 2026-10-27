import { MAX_IMAGE_SIZE_BYTES, validateNewImages } from './listing-image';

function file(name: string, type: string, size = 1000): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateNewImages', () => {
  it('accepts JPG, PNG and WebP', () => {
    const files = [
      file('a.jpg', 'image/jpeg'),
      file('b.png', 'image/png'),
      file('c.webp', 'image/webp'),
    ];
    expect(validateNewImages(files, 0)).toBeNull();
  });

  it('rejects unsupported types and mismatched extensions', () => {
    expect(validateNewImages([file('a.gif', 'image/gif')], 0)).toContain('not supported');
    expect(validateNewImages([file('a.pdf', 'image/png')], 0)).toContain('not supported');
  });

  it('rejects files over 5 MB but allows exactly 5 MB', () => {
    expect(validateNewImages([file('a.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES + 1)], 0)).toContain(
      '5 MB',
    );
    expect(validateNewImages([file('a.jpg', 'image/jpeg', MAX_IMAGE_SIZE_BYTES)], 0)).toBeNull();
  });

  it('enforces the maximum of 5 images including existing ones', () => {
    const two = [file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')];
    expect(validateNewImages(two, 3)).toBeNull();
    expect(validateNewImages(two, 4)).toContain('1 more image');
    expect(validateNewImages(two, 5)).toContain('maximum of 5');
  });
});
