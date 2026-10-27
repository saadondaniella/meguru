import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListingImagePicker } from './listing-image-picker';
import { ListingImageItem } from '../../../../models/listing-image';

describe('ListingImagePicker', () => {
  let fixture: ComponentFixture<ListingImagePicker>;
  let component: ListingImagePicker;

  const existing = (key: string): ListingImageItem => ({
    kind: 'existing',
    key,
    imagePath: key,
    url: `https://img/${key}`,
  });

  const labels = () =>
    Array.from<Element>(fixture.nativeElement.querySelectorAll('.main-image-label'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ListingImagePicker] }).compileComponents();
    fixture = TestBed.createComponent(ListingImagePicker);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('images', [existing('a'), existing('b'), existing('c')]);
    await fixture.whenStable();
  });

  it('marks only the first image as MAIN IMAGE', () => {
    expect(labels().length).toBe(1);
    const items = fixture.nativeElement.querySelectorAll('.image-preview-item');
    expect(items[0].querySelector('.main-image-label')).toBeTruthy();
  });

  it('moves the selected image to the front and shows it as the preview', async () => {
    component.setMain('c');
    await fixture.whenStable();

    expect(component.images().map((i) => i.key)).toEqual(['c', 'a', 'b']);
    expect(labels().length).toBe(1);
    expect(fixture.nativeElement.querySelector('.listing-image-preview').src).toContain('c');
  });

  it('promotes the next image when the main image is removed', async () => {
    component.remove('a');
    await fixture.whenStable();

    expect(component.images().map((i) => i.key)).toEqual(['b', 'c']);
    expect(labels().length).toBe(1);
  });

  it('shows the placeholder when every image is removed', async () => {
    for (const key of ['a', 'b', 'c']) component.remove(key);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.image-placeholder')).toBeTruthy();
    expect(labels().length).toBe(0);
  });

  it('rejects files beyond the limit with an error and keeps the list unchanged', async () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const files = ['x.png', 'y.png', 'z.png'].map(
      (name) => new File(['x'], name, { type: 'image/png' }),
    );
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(component.images().length).toBe(3);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'more image',
    );
  });
});
