// Seller storefront customization.
//
// The database stores palette KEYS (never hex values or CSS). Everything that
// reaches the stylesheet comes from the constants in this file, so unknown or
// tampered values can only ever fall back to the defaults.

import {
  DEFAULT_LISTING_ORDER,
  StorefrontListingOrder,
  resolveListingOrder,
} from './storefront-listing-order';

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export type StorefrontBackground =
  | 'ivory'
  | 'warm_sand'
  | 'sage'
  | 'dusty_rose'
  | 'soft_blue'
  | 'olive'
  | 'terracotta'
  | 'cobalt_blue'
  | 'black';

export type StorefrontTextColor =
  'black' | 'white' | 'charcoal' | 'olive' | 'terracotta' | 'cobalt' | 'burgundy' | 'cream';

export interface PaletteColor<K extends string> {
  key: K;
  label: string;
  hex: string;
}

export const STOREFRONT_BACKGROUNDS: readonly PaletteColor<StorefrontBackground>[] = [
  { key: 'ivory', label: 'Ivory', hex: '#F5F2EB' },
  { key: 'warm_sand', label: 'Warm Sand', hex: '#E6D9C8' },
  { key: 'sage', label: 'Sage', hex: '#C9D0BF' },
  { key: 'dusty_rose', label: 'Dusty Rose', hex: '#E4C9C5' },
  { key: 'soft_blue', label: 'Soft Blue', hex: '#CFDCE2' },
  { key: 'olive', label: 'Olive', hex: '#4D5D46' },
  { key: 'terracotta', label: 'Terracotta', hex: '#9E5A44' },
  { key: 'cobalt_blue', label: 'Cobalt Blue', hex: '#254CC7' },
  { key: 'black', label: 'Black', hex: '#171717' },
];

export const STOREFRONT_TEXT_COLORS: readonly PaletteColor<StorefrontTextColor>[] = [
  { key: 'black', label: 'Black', hex: '#171717' },
  { key: 'white', label: 'White', hex: '#FFFFFF' },
  { key: 'charcoal', label: 'Charcoal', hex: '#414141' },
  { key: 'olive', label: 'Olive', hex: '#4D5D46' },
  { key: 'terracotta', label: 'Terracotta', hex: '#9E5A44' },
  { key: 'cobalt', label: 'Cobalt', hex: '#254CC7' },
  { key: 'burgundy', label: 'Burgundy', hex: '#702D40' },
  { key: 'cream', label: 'Cream', hex: '#F5F2EB' },
];

const ACCENT_HEX = '#9E5A44';

/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5;

// ---------------------------------------------------------------------------
// Typography (display name only)
// ---------------------------------------------------------------------------

export type NameFontFamily = 'plus_jakarta_sans' | 'noto_serif';

export type NameFontWeight = 300 | 400 | 500 | 600 | 700 | 800;

export const NAME_FONT_WEIGHTS: readonly { value: NameFontWeight; label: string }[] = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'ExtraBold' },
];

export interface NameFontOption {
  key: NameFontFamily;
  label: string;
  /** Private alias first (see seller-storefront.css), then safe fallbacks. */
  cssFamily: string;
  supportedWeights: readonly NameFontWeight[];
}

const ALL_WEIGHTS: readonly NameFontWeight[] = [300, 400, 500, 600, 700, 800];

// Both self-hosted files are variable fonts covering 300 to 800.
export const NAME_FONTS: readonly NameFontOption[] = [
  {
    key: 'plus_jakarta_sans',
    label: 'Plus Jakarta Sans',
    cssFamily: "'Meguru Name Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
    supportedWeights: ALL_WEIGHTS,
  },
  {
    key: 'noto_serif',
    label: 'Noto Serif',
    cssFamily: "'Meguru Name Serif', 'Noto Serif', Georgia, serif",
    supportedWeights: ALL_WEIGHTS,
  },
];

export const NAME_SIZE_MIN = 28;
export const NAME_SIZE_MAX = 128;
export const NAME_SIZE_STEP = 1;
/** Slider position used when switching from the default size to a custom one. */
export const NAME_SIZE_START = 64;

export type TaglineStyle = 'regular' | 'italic';

export const TAGLINE_STYLES: readonly { key: TaglineStyle; label: string }[] = [
  { key: 'regular', label: 'Regular' },
  { key: 'italic', label: 'Italic' },
];

export const TAGLINE_MAX_LENGTH = 80;

// ---------------------------------------------------------------------------
// Image shape
// ---------------------------------------------------------------------------

export type ImageShape = 'classic' | 'soft' | 'circle';

export const IMAGE_SHAPES: readonly {
  key: ImageShape;
  label: string;
  description: string;
  radius: string;
  ratio: string;
}[] = [
  {
    key: 'classic',
    label: 'Classic',
    description: 'Sharp corners',
    radius: '0',
    ratio: '5 / 6',
  },
  {
    key: 'soft',
    label: 'Soft',
    description: 'Rounded corners',
    radius: '24px',
    ratio: '5 / 6',
  },
  {
    key: 'circle',
    label: 'Circle',
    description: 'Round crop',
    radius: '50%',
    ratio: '1 / 1',
  },
];

// ---------------------------------------------------------------------------
// Style model and defaults
// ---------------------------------------------------------------------------

export interface StorefrontStyle {
  background: StorefrontBackground;
  textColor: StorefrontTextColor;
  nameFont: NameFontFamily;
  nameWeight: NameFontWeight;
  /** null keeps the existing responsive default size. */
  nameSize: number | null;
  taglineStyle: TaglineStyle;
  imageShape: ImageShape;
  listingOrder: StorefrontListingOrder;
}

export const DEFAULT_STOREFRONT_STYLE: StorefrontStyle = {
  background: 'ivory',
  textColor: 'olive',
  nameFont: 'plus_jakarta_sans',
  nameWeight: 500,
  nameSize: null,
  taglineStyle: 'regular',
  imageShape: 'classic',
  listingOrder: DEFAULT_LISTING_ORDER,
};

/** The profile columns that hold the style (all optional on legacy rows). */
export interface StorefrontStyleColumns {
  storefront_background?: string | null;
  storefront_text_color?: string | null;
  storefront_name_font?: string | null;
  storefront_name_weight?: number | null;
  storefront_name_size?: number | null;
  storefront_tagline_style?: string | null;
  storefront_image_shape?: string | null;
  storefront_listing_order?: string | null;
}

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.x)
// ---------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const BACKGROUND_HEX = new Map(STOREFRONT_BACKGROUNDS.map((c) => [c.key, c.hex]));
const TEXT_HEX = new Map(STOREFRONT_TEXT_COLORS.map((c) => [c.key, c.hex]));

export function backgroundHex(key: StorefrontBackground): string {
  return BACKGROUND_HEX.get(key) ?? BACKGROUND_HEX.get(DEFAULT_STOREFRONT_STYLE.background)!;
}

export function textHex(key: StorefrontTextColor): string {
  return TEXT_HEX.get(key) ?? TEXT_HEX.get(DEFAULT_STOREFRONT_STYLE.textColor)!;
}

export function pairContrast(background: StorefrontBackground, text: StorefrontTextColor): number {
  return contrastRatio(backgroundHex(background), textHex(text));
}

export function isAccessiblePair(
  background: StorefrontBackground,
  text: StorefrontTextColor,
): boolean {
  return pairContrast(background, text) >= MIN_CONTRAST;
}

/** Every allowed (background, text) pair. Must match the database CHECK. */
export const ALLOWED_PAIRS: readonly (readonly [StorefrontBackground, StorefrontTextColor])[] =
  STOREFRONT_BACKGROUNDS.flatMap((background) =>
    STOREFRONT_TEXT_COLORS.filter((text) => isAccessiblePair(background.key, text.key)).map(
      (text) => [background.key, text.key] as const,
    ),
  );

/**
 * Keeps the current text color when it is readable on the background,
 * otherwise picks the first readable one in palette order.
 */
export function correctedTextColor(
  background: StorefrontBackground,
  current: StorefrontTextColor,
): StorefrontTextColor {
  if (isAccessiblePair(background, current)) return current;

  return (
    STOREFRONT_TEXT_COLORS.find((text) => isAccessiblePair(background, text.key))?.key ??
    DEFAULT_STOREFRONT_STYLE.textColor
  );
}

/** Terracotta accent when it is readable on the background, else the text color. */
export function accentHex(style: Pick<StorefrontStyle, 'background' | 'textColor'>): string {
  return contrastRatio(backgroundHex(style.background), ACCENT_HEX) >= MIN_CONTRAST
    ? ACCENT_HEX
    : textHex(style.textColor);
}

// ---------------------------------------------------------------------------
// Weights and sizes
// ---------------------------------------------------------------------------

export function nameFontOption(key: NameFontFamily): NameFontOption {
  return NAME_FONTS.find((font) => font.key === key) ?? NAME_FONTS[0];
}

export function supportedWeights(key: NameFontFamily): readonly NameFontWeight[] {
  return nameFontOption(key).supportedWeights;
}

/** Keeps the weight if the font supports it, otherwise the closest supported one. */
export function correctedWeight(font: NameFontFamily, weight: NameFontWeight): NameFontWeight {
  const supported = supportedWeights(font);

  if (supported.includes(weight)) return weight;

  return supported.reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
  );
}

export function clampNameSize(size: number): number {
  return Math.min(NAME_SIZE_MAX, Math.max(NAME_SIZE_MIN, Math.round(size)));
}

// ---------------------------------------------------------------------------
// Resolving a stored profile row
// ---------------------------------------------------------------------------

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Turns stored values into a valid style. Anything unknown falls back to defaults. */
export function resolveStorefrontStyle(
  row: StorefrontStyleColumns | null | undefined,
): StorefrontStyle {
  const defaults = DEFAULT_STOREFRONT_STYLE;

  const background = pick(
    row?.storefront_background,
    STOREFRONT_BACKGROUNDS.map((c) => c.key),
    defaults.background,
  );

  let textColor = pick(
    row?.storefront_text_color,
    STOREFRONT_TEXT_COLORS.map((c) => c.key),
    defaults.textColor,
  );

  // A stored pair that is not readable is never rendered.
  textColor = correctedTextColor(background, textColor);

  const nameFont = pick(
    row?.storefront_name_font,
    NAME_FONTS.map((f) => f.key),
    defaults.nameFont,
  );

  const storedWeight = Number(row?.storefront_name_weight);
  const nameWeight = correctedWeight(
    nameFont,
    NAME_FONT_WEIGHTS.some((w) => w.value === storedWeight)
      ? (storedWeight as NameFontWeight)
      : defaults.nameWeight,
  );

  const storedSize = row?.storefront_name_size;
  const nameSize =
    typeof storedSize === 'number' && Number.isFinite(storedSize)
      ? clampNameSize(storedSize)
      : null;

  return {
    background,
    textColor,
    nameFont,
    nameWeight,
    nameSize,
    taglineStyle: pick(
      row?.storefront_tagline_style,
      TAGLINE_STYLES.map((s) => s.key),
      defaults.taglineStyle,
    ),
    imageShape: pick(
      row?.storefront_image_shape,
      IMAGE_SHAPES.map((s) => s.key),
      defaults.imageShape,
    ),
    listingOrder: resolveListingOrder(row?.storefront_listing_order),
  };
}

/** The columns written on save. */
export function styleToColumns(style: StorefrontStyle) {
  return {
    storefront_background: style.background,
    storefront_text_color: style.textColor,
    storefront_name_font: style.nameFont,
    storefront_name_weight: style.nameWeight,
    storefront_name_size: style.nameSize,
    storefront_tagline_style: style.taglineStyle,
    storefront_image_shape: style.imageShape,
    storefront_listing_order: style.listingOrder,
  };
}

export function stylesEqual(a: StorefrontStyle, b: StorefrontStyle): boolean {
  return (
    a.background === b.background &&
    a.textColor === b.textColor &&
    a.nameFont === b.nameFont &&
    a.nameWeight === b.nameWeight &&
    a.nameSize === b.nameSize &&
    a.taglineStyle === b.taglineStyle &&
    a.imageShape === b.imageShape &&
    a.listingOrder === b.listingOrder
  );
}

// ---------------------------------------------------------------------------
// CSS custom properties for the storefront wrapper
// ---------------------------------------------------------------------------

/**
 * The chosen size is the desktop maximum. It scales down with the container
 * width, but never below 65% of the chosen size. The default keeps the
 * existing responsive size.
 */
export function nameFontSizeExpression(size: number | null): string {
  if (size === null) return 'clamp(3.5rem, 8cqi, 8rem)';

  const floor = Math.round(size * 0.65 * 10) / 10;

  return `min(${size}px, max(${floor}px, 11cqi))`;
}

/** Default size on narrow containers: matches the previous mobile size. */
export function nameFontSizeSmallExpression(size: number | null): string {
  return size === null ? 'clamp(2.6rem, 12cqi, 4.5rem)' : nameFontSizeExpression(size);
}

function nameLetterSpacing(size: number | null): string {
  if (size === null) return '-0.06em';
  if (size >= 80) return '-0.05em';
  if (size >= 48) return '-0.03em';

  return '-0.01em';
}

/** Scoped to the storefront wrapper only. */
export function storefrontCssVars(style: StorefrontStyle): Record<string, string> {
  const shape = IMAGE_SHAPES.find((s) => s.key === style.imageShape) ?? IMAGE_SHAPES[0];
  const text = textHex(style.textColor);
  const accent = accentHex(style);

  return {
    '--sf-bg': backgroundHex(style.background),
    '--sf-text': text,
    '--sf-accent': accent,
    '--sf-name-font': nameFontOption(style.nameFont).cssFamily,
    '--sf-name-weight': String(style.nameWeight),
    '--sf-name-size': nameFontSizeExpression(style.nameSize),
    '--sf-name-size-small': nameFontSizeSmallExpression(style.nameSize),
    '--sf-name-spacing': nameLetterSpacing(style.nameSize),
    '--sf-name-line': style.nameSize === null ? '0.95' : style.nameSize >= 64 ? '1' : '1.1',
    '--sf-tagline-style': style.taglineStyle === 'italic' ? 'italic' : 'normal',
    '--sf-image-radius': shape.radius,
    '--sf-image-ratio': shape.ratio,
    // Existing components (heart button, listing cards) read these tokens.
    '--color-primary': text,
    '--color-tertiary': accent,
  };
}
