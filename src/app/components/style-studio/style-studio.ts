import { Component, computed, input, model, signal } from '@angular/core';
import {
  DEFAULT_STOREFRONT_STYLE,
  IMAGE_SHAPES,
  ImageShape,
  NAME_FONTS,
  NAME_FONT_WEIGHTS,
  NAME_SIZE_MAX,
  NAME_SIZE_MIN,
  NAME_SIZE_START,
  NAME_SIZE_STEP,
  NameFontFamily,
  NameFontWeight,
  STOREFRONT_BACKGROUNDS,
  STOREFRONT_TEXT_COLORS,
  StorefrontBackground,
  StorefrontStyle,
  StorefrontTextColor,
  TAGLINE_STYLES,
  TaglineStyle,
  contrastRatio,
  correctedTextColor,
  correctedWeight,
  isAccessiblePair,
  nameFontOption,
  pairContrast,
  stylesEqual,
  supportedWeights,
} from '../../models/storefront-theme';

// The controls of the storefront "style studio". It edits a StorefrontStyle
// value and never touches the saved profile: saving stays with the page.
@Component({
  selector: 'app-style-studio',
  templateUrl: './style-studio.html',
  styleUrl: './style-studio.css',
})
export class StyleStudio {
  readonly value = model.required<StorefrontStyle>();

  // Shown in the font and weight samples.
  readonly sampleName = input('Your name');

  readonly backgrounds = STOREFRONT_BACKGROUNDS;
  readonly textColors = STOREFRONT_TEXT_COLORS;
  readonly fonts = NAME_FONTS;
  readonly taglineStyles = TAGLINE_STYLES;
  readonly imageShapes = IMAGE_SHAPES;

  readonly sizeMin = NAME_SIZE_MIN;
  readonly sizeMax = NAME_SIZE_MAX;
  readonly sizeStep = NAME_SIZE_STEP;

  // Polite announcements for automatic corrections and reset.
  readonly announcement = signal('');

  readonly backgroundLabel = computed(
    () => this.backgrounds.find((c) => c.key === this.value().background)?.label ?? '',
  );

  readonly fontFamily = computed(() => nameFontOption(this.value().nameFont).cssFamily);

  readonly weights = computed(() =>
    NAME_FONT_WEIGHTS.filter((w) => supportedWeights(this.value().nameFont).includes(w.value)),
  );

  readonly contrast = computed(() => {
    const { background, textColor } = this.value();

    return Math.round(pairContrast(background, textColor) * 10) / 10;
  });

  readonly usesDefaultSize = computed(() => this.value().nameSize === null);

  readonly isDefault = computed(() => stylesEqual(this.value(), DEFAULT_STOREFRONT_STYLE));

  isTextAvailable(text: StorefrontTextColor): boolean {
    return isAccessiblePair(this.value().background, text);
  }

  // A tick that stays visible on both light and dark swatches.
  tickColor(hex: string): string {
    return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#171717') ? '#FFFFFF' : '#171717';
  }

  setBackground(background: StorefrontBackground) {
    const current = this.value();
    const textColor = correctedTextColor(background, current.textColor);

    this.value.set({ ...current, background, textColor });

    if (textColor !== current.textColor) {
      const label = this.textColors.find((c) => c.key === textColor)?.label ?? '';

      this.announcement.set(`Text color changed to ${label} to keep the text readable.`);
    } else {
      this.announcement.set('');
    }
  }

  setTextColor(textColor: StorefrontTextColor) {
    if (!this.isTextAvailable(textColor)) return;

    this.value.update((v) => ({ ...v, textColor }));
    this.announcement.set('');
  }

  setFont(nameFont: NameFontFamily) {
    const current = this.value();
    const nameWeight = correctedWeight(nameFont, current.nameWeight);

    this.value.set({ ...current, nameFont, nameWeight });
    this.announcement.set('');
  }

  setWeight(nameWeight: NameFontWeight) {
    this.value.update((v) => ({ ...v, nameWeight }));
  }

  setSize(size: number) {
    this.value.update((v) => ({
      ...v,
      nameSize: Math.min(NAME_SIZE_MAX, Math.max(NAME_SIZE_MIN, Math.round(size))),
    }));
  }

  setUseDefaultSize(useDefault: boolean) {
    this.value.update((v) => ({
      ...v,
      nameSize: useDefault ? null : (v.nameSize ?? NAME_SIZE_START),
    }));
  }

  setTaglineStyle(taglineStyle: TaglineStyle) {
    this.value.update((v) => ({ ...v, taglineStyle }));
  }

  setImageShape(imageShape: ImageShape) {
    this.value.update((v) => ({ ...v, imageShape }));
  }

  // Only the style: name, tagline, bio, avatar and contacts are not touched.
  resetToDefault() {
    this.value.set({ ...DEFAULT_STOREFRONT_STYLE });
    this.announcement.set('Style reset to default. Save your profile to apply it.');
  }
}
