import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DEFAULT_STOREFRONT_STYLE,
  NAME_SIZE_MAX,
  NAME_SIZE_MIN,
  StorefrontStyle,
} from '../../models/storefront-theme';
import { StyleStudio } from './style-studio';

describe('StyleStudio', () => {
  let fixture: ComponentFixture<StyleStudio>;
  let component: StyleStudio;

  const el = () => fixture.nativeElement as HTMLElement;

  const radios = (name: string) =>
    Array.from(el().querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));

  const labelsOf = (name: string) =>
    radios(name).map((input) => input.closest('label')?.textContent?.replace(/\s+/g, ' ').trim());

  async function render(style: Partial<StorefrontStyle> = {}) {
    fixture = TestBed.createComponent(StyleStudio);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', { ...DEFAULT_STOREFRONT_STYLE, ...style });
    await fixture.whenStable();
  }

  async function choose(name: string, index: number) {
    const input = radios(name)[index];

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const status = () => el().querySelector('[role="status"]')?.textContent?.trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StyleStudio] });
  });

  it('offers the 9 backgrounds and 8 text colors as native radios', async () => {
    await render();

    expect(radios('storefront-background')).toHaveLength(9);
    expect(radios('storefront-text-color')).toHaveLength(8);
    expect(labelsOf('storefront-background')[0]).toContain('Ivory');
    expect(radios('storefront-background')[0].checked).toBe(true);
    expect(radios('storefront-text-color').find((r) => r.checked)?.value).toBe('olive');
  });

  it('groups every control in a labelled fieldset', async () => {
    await render();

    const legends = Array.from(el().querySelectorAll('fieldset legend')).map((l) =>
      l.textContent?.trim(),
    );

    expect(legends).toEqual([
      'BACKGROUND',
      'TEXT COLOR',
      'NAME FONT',
      'NAME WEIGHT',
      'NAME SIZE',
      'TAGLINE STYLE',
      'LISTING IMAGES',
      'LISTING ORDER',
    ]);
  });

  it('disables, but still shows, text colors that are not readable', async () => {
    await render({ background: 'black', textColor: 'white' });

    const texts = radios('storefront-text-color');
    const enabled = texts.filter((r) => !r.disabled).map((r) => r.value);

    expect(texts).toHaveLength(8);
    expect(enabled.sort()).toEqual(['cream', 'white']);
    expect(el().textContent).toContain('not available: not enough contrast on Black');
    expect(el().querySelector('#text-color-hint')?.textContent).toContain('4.5:1');
  });

  it('shows the current contrast ratio', async () => {
    await render();

    expect(el().querySelector('#text-color-hint')?.textContent).toContain('6.3:1');
  });

  it('changes the text color automatically and announces it', async () => {
    await render({ background: 'ivory', textColor: 'olive' });

    await choose('storefront-background', 8); // Black

    expect(component.value().background).toBe('black');
    expect(component.value().textColor).toBe('white');
    expect(status()).toBe('Text color changed to White to keep the text readable.');
  });

  it('keeps the text color when it stays readable', async () => {
    await render({ background: 'ivory', textColor: 'olive' });

    await choose('storefront-background', 1); // Warm Sand

    expect(component.value().textColor).toBe('olive');
    expect(status()).toBe('');
  });

  it('does not select a disabled text color', async () => {
    await render({ background: 'black', textColor: 'white' });

    component.setTextColor('olive');

    expect(component.value().textColor).toBe('white');
  });

  it('offers all six weights for both fonts, drawn in the chosen font', async () => {
    await render();

    expect(labelsOf('storefront-name-weight')).toEqual([
      'Light',
      'Regular',
      'Medium',
      'SemiBold',
      'Bold',
      'ExtraBold',
    ]);

    await choose('storefront-name-font', 1);

    expect(component.value().nameFont).toBe('noto_serif');
    expect(labelsOf('storefront-name-weight')).toHaveLength(6);
    expect(component.value().nameWeight).toBe(500);
  });

  it('selects the weight', async () => {
    await render();

    await choose('storefront-name-weight', 5);

    expect(component.value().nameWeight).toBe(800);
  });

  it('uses the default size until a custom one is chosen', async () => {
    await render();

    const slider = el().querySelector('input[type="range"]') as HTMLInputElement;
    const toggle = el().querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(slider.min).toBe(String(NAME_SIZE_MIN));
    expect(slider.max).toBe(String(NAME_SIZE_MAX));
    expect(slider.disabled).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(el().querySelector('output')?.textContent?.trim()).toBe('Default');

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.value().nameSize).toBe(64);
    expect(slider.disabled).toBe(false);
    expect(el().querySelector('output')?.textContent?.trim()).toBe('64 px');
    expect(slider.getAttribute('aria-valuetext')).toBe('64 pixels');
  });

  it('changes and clamps the size', async () => {
    await render({ nameSize: 64 });

    const slider = el().querySelector('input[type="range"]') as HTMLInputElement;

    slider.value = '100';
    slider.dispatchEvent(new Event('input'));
    expect(component.value().nameSize).toBe(100);

    component.setSize(5);
    expect(component.value().nameSize).toBe(NAME_SIZE_MIN);

    component.setSize(900);
    expect(component.value().nameSize).toBe(NAME_SIZE_MAX);
  });

  it('can go back to the default size', async () => {
    await render({ nameSize: 90 });

    component.setUseDefaultSize(true);

    expect(component.value().nameSize).toBeNull();
  });

  it('selects the tagline style and the image shape', async () => {
    await render();

    await choose('storefront-tagline-style', 1);
    await choose('storefront-image-shape', 2);

    expect(component.value().taglineStyle).toBe('italic');
    expect(component.value().imageShape).toBe('circle');
    expect(labelsOf('storefront-image-shape')).toEqual([
      'Classic Sharp corners',
      'Soft Rounded corners',
      'Circle Round crop',
    ]);
  });

  describe('listing order', () => {
    it('offers the eight options and selects the current one', async () => {
      await render({ listingOrder: 'price_asc' });

      const select = el().querySelector('#storefront-listing-order') as HTMLSelectElement;
      const labels = Array.from(select.options).map((option) => option.textContent?.trim());

      expect(labels).toEqual([
        'Newest first',
        'Oldest first',
        'Price: Low to high',
        'Price: High to low',
        'Brand: A–Z',
        'Brand: Z–A',
        'Category: A–Z',
        'Category: Z–A',
      ]);
      expect(select.value).toBe('price_asc');
      expect(el().querySelector('label[for="storefront-listing-order"]')).not.toBeNull();
    });

    it('updates the style when another order is chosen', async () => {
      await render();

      const select = el().querySelector('#storefront-listing-order') as HTMLSelectElement;
      select.value = 'brand_desc';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(component.value().listingOrder).toBe('brand_desc');
    });
  });

  describe('reset', () => {
    const resetButton = () => el().querySelector('.reset-style') as HTMLButtonElement;

    it('is disabled while the style is the default', async () => {
      await render();

      expect(resetButton().disabled).toBe(true);
    });

    it('restores every style setting to the default and announces it', async () => {
      await render({
        background: 'black',
        textColor: 'white',
        nameFont: 'noto_serif',
        nameWeight: 800,
        nameSize: 100,
        taglineStyle: 'italic',
        imageShape: 'circle',
        listingOrder: 'brand_desc',
      });

      expect(resetButton().disabled).toBe(false);

      resetButton().click();
      fixture.detectChanges();

      expect(component.value()).toEqual(DEFAULT_STOREFRONT_STYLE);
      expect(component.value().taglineStyle).toBe('regular');
      expect(status()).toBe('Style reset to default. Save your profile to apply it.');
      expect(resetButton().disabled).toBe(true);
    });
  });
});
