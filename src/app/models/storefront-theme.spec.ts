import {
  ALLOWED_PAIRS,
  DEFAULT_STOREFRONT_STYLE,
  NAME_SIZE_MAX,
  NAME_SIZE_MIN,
  StorefrontBackground,
  StorefrontTextColor,
  accentHex,
  clampNameSize,
  contrastRatio,
  correctedTextColor,
  correctedWeight,
  isAccessiblePair,
  nameFontSizeExpression,
  pairContrast,
  resolveStorefrontStyle,
  storefrontCssVars,
  styleToColumns,
  stylesEqual,
} from './storefront-theme';

// Pinned copy of the pairs in the database CHECK
// (supabase/migrations/20261104140000_add_storefront_customization.sql).
const MIGRATION_PAIRS: [StorefrontBackground, StorefrontTextColor][] = [
  ['ivory', 'black'],
  ['ivory', 'charcoal'],
  ['ivory', 'olive'],
  ['ivory', 'terracotta'],
  ['ivory', 'cobalt'],
  ['ivory', 'burgundy'],
  ['warm_sand', 'black'],
  ['warm_sand', 'charcoal'],
  ['warm_sand', 'olive'],
  ['warm_sand', 'cobalt'],
  ['warm_sand', 'burgundy'],
  ['sage', 'black'],
  ['sage', 'charcoal'],
  ['sage', 'cobalt'],
  ['sage', 'burgundy'],
  ['dusty_rose', 'black'],
  ['dusty_rose', 'charcoal'],
  ['dusty_rose', 'olive'],
  ['dusty_rose', 'cobalt'],
  ['dusty_rose', 'burgundy'],
  ['soft_blue', 'black'],
  ['soft_blue', 'charcoal'],
  ['soft_blue', 'olive'],
  ['soft_blue', 'cobalt'],
  ['soft_blue', 'burgundy'],
  ['olive', 'white'],
  ['olive', 'cream'],
  ['terracotta', 'white'],
  ['terracotta', 'cream'],
  ['cobalt_blue', 'white'],
  ['cobalt_blue', 'cream'],
  ['black', 'white'],
  ['black', 'cream'],
];

describe('storefront theme', () => {
  describe('contrast', () => {
    it('matches known WCAG values', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
      expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
      expect(pairContrast('ivory', 'olive')).toBeCloseTo(6.3, 1);
    });

    it('is symmetric', () => {
      expect(contrastRatio('#F5F2EB', '#4D5D46')).toBe(contrastRatio('#4D5D46', '#F5F2EB'));
    });

    it('does not round borderline pairs', () => {
      expect(pairContrast('sage', 'olive')).toBeLessThan(4.5);
      expect(isAccessiblePair('sage', 'olive')).toBe(false);

      expect(pairContrast('sage', 'cobalt')).toBeGreaterThanOrEqual(4.5);
      expect(isAccessiblePair('sage', 'cobalt')).toBe(true);

      expect(isAccessiblePair('dusty_rose', 'olive')).toBe(true);
    });

    it('allows exactly the 33 pairs used by the database constraint', () => {
      expect(ALLOWED_PAIRS).toHaveLength(33);
      expect(ALLOWED_PAIRS.map((pair) => [...pair])).toEqual(MIGRATION_PAIRS);
    });

    it('keeps the default combination accessible', () => {
      const { background, textColor } = DEFAULT_STOREFRONT_STYLE;

      expect(isAccessiblePair(background, textColor)).toBe(true);
    });

    it('only offers white or cream on dark backgrounds', () => {
      for (const background of ['olive', 'terracotta', 'cobalt_blue', 'black'] as const) {
        const allowed = ALLOWED_PAIRS.filter(([bg]) => bg === background).map(([, text]) => text);

        expect(allowed.sort()).toEqual(['cream', 'white']);
      }
    });
  });

  describe('corrections', () => {
    it('keeps a readable text color', () => {
      expect(correctedTextColor('ivory', 'olive')).toBe('olive');
    });

    it('switches an unreadable text color to the first readable one', () => {
      expect(correctedTextColor('black', 'olive')).toBe('white');
      expect(correctedTextColor('sage', 'olive')).toBe('black');
    });

    it('keeps a supported weight and snaps others to the closest one', () => {
      expect(correctedWeight('noto_serif', 300)).toBe(300);
      expect(correctedWeight('plus_jakarta_sans', 800)).toBe(800);
      expect(correctedWeight('plus_jakarta_sans', 550 as never)).toBe(500);
    });

    it('clamps the name size', () => {
      expect(clampNameSize(10)).toBe(NAME_SIZE_MIN);
      expect(clampNameSize(500)).toBe(NAME_SIZE_MAX);
      expect(clampNameSize(47.6)).toBe(48);
    });
  });

  describe('resolveStorefrontStyle', () => {
    it('returns the defaults for a legacy profile', () => {
      expect(resolveStorefrontStyle({})).toEqual(DEFAULT_STOREFRONT_STYLE);
      expect(resolveStorefrontStyle(null)).toEqual(DEFAULT_STOREFRONT_STYLE);
      expect(resolveStorefrontStyle(undefined)).toEqual(DEFAULT_STOREFRONT_STYLE);
    });

    it('reads stored values', () => {
      expect(
        resolveStorefrontStyle({
          storefront_background: 'black',
          storefront_text_color: 'cream',
          storefront_name_font: 'noto_serif',
          storefront_name_weight: 700,
          storefront_name_size: 96,
          storefront_tagline_style: 'italic',
          storefront_image_shape: 'circle',
          storefront_listing_order: 'brand_desc',
        }),
      ).toEqual({
        background: 'black',
        textColor: 'cream',
        nameFont: 'noto_serif',
        nameWeight: 700,
        nameSize: 96,
        taglineStyle: 'italic',
        imageShape: 'circle',
        listingOrder: 'brand_desc',
      });
    });

    it('falls back for unknown values instead of passing them through', () => {
      const style = resolveStorefrontStyle({
        storefront_background: 'url(javascript:alert(1))',
        storefront_text_color: '#ff0000',
        storefront_name_font: 'Comic Sans',
        storefront_name_weight: 123,
        storefront_name_size: Number.NaN,
        storefront_tagline_style: 'oblique',
        storefront_image_shape: 'hexagon',
        storefront_listing_order: 'random',
      });

      expect(style).toEqual(DEFAULT_STOREFRONT_STYLE);
    });

    it('never renders an unreadable stored pair', () => {
      const style = resolveStorefrontStyle({
        storefront_background: 'black',
        storefront_text_color: 'olive',
      });

      expect(isAccessiblePair(style.background, style.textColor)).toBe(true);
    });

    it('clamps stored sizes', () => {
      expect(resolveStorefrontStyle({ storefront_name_size: 5 }).nameSize).toBe(NAME_SIZE_MIN);
      expect(resolveStorefrontStyle({ storefront_name_size: 999 }).nameSize).toBe(NAME_SIZE_MAX);
      expect(resolveStorefrontStyle({ storefront_name_size: null }).nameSize).toBeNull();
    });
  });

  describe('persistence helpers', () => {
    it('maps a style to the stored columns', () => {
      expect(styleToColumns(DEFAULT_STOREFRONT_STYLE)).toEqual({
        storefront_background: 'ivory',
        storefront_text_color: 'olive',
        storefront_name_font: 'plus_jakarta_sans',
        storefront_name_weight: 500,
        storefront_name_size: null,
        storefront_tagline_style: 'regular',
        storefront_image_shape: 'classic',
        storefront_listing_order: 'newest',
      });
    });

    it('round trips through resolve', () => {
      const style = {
        ...DEFAULT_STOREFRONT_STYLE,
        nameSize: 72,
        imageShape: 'soft' as const,
        listingOrder: 'price_desc' as const,
      };

      expect(resolveStorefrontStyle(styleToColumns(style))).toEqual(style);
    });

    it('compares styles', () => {
      expect(stylesEqual(DEFAULT_STOREFRONT_STYLE, { ...DEFAULT_STOREFRONT_STYLE })).toBe(true);
      expect(
        stylesEqual(DEFAULT_STOREFRONT_STYLE, { ...DEFAULT_STOREFRONT_STYLE, nameSize: 40 }),
      ).toBe(false);
    });
  });

  describe('css variables', () => {
    it('keeps the existing look for the default style', () => {
      const vars = storefrontCssVars(DEFAULT_STOREFRONT_STYLE);

      expect(vars['--sf-bg']).toBe('#F5F2EB');
      expect(vars['--sf-text']).toBe('#4D5D46');
      expect(vars['--sf-accent']).toBe('#9E5A44');
      expect(vars['--sf-name-weight']).toBe('500');
      expect(vars['--sf-name-size']).toBe('clamp(3.5rem, 8cqi, 8rem)');
      expect(vars['--sf-name-size-small']).toBe('clamp(2.6rem, 12cqi, 4.5rem)');
      expect(vars['--sf-name-spacing']).toBe('-0.06em');
      expect(vars['--sf-image-radius']).toBe('0');
      expect(vars['--sf-image-ratio']).toBe('5 / 6');
      expect(vars['--sf-tagline-style']).toBe('normal');
    });

    it('scales a custom name size down with the container', () => {
      expect(nameFontSizeExpression(100)).toBe('min(100px, max(65px, 11cqi))');
      expect(nameFontSizeExpression(28)).toBe('min(28px, max(18.2px, 11cqi))');
    });

    it('reflects the chosen style', () => {
      const vars = storefrontCssVars({
        ...DEFAULT_STOREFRONT_STYLE,
        background: 'black',
        textColor: 'white',
        nameFont: 'noto_serif',
        taglineStyle: 'italic',
        imageShape: 'circle',
      });

      expect(vars['--sf-bg']).toBe('#171717');
      expect(vars['--sf-text']).toBe('#FFFFFF');
      expect(vars['--sf-name-font']).toContain('Meguru Name Serif');
      expect(vars['--sf-tagline-style']).toBe('italic');
      expect(vars['--sf-image-radius']).toBe('50%');
      expect(vars['--sf-image-ratio']).toBe('1 / 1');
      // Existing tokens used by the heart button and listing cards.
      expect(vars['--color-primary']).toBe('#FFFFFF');
    });

    it('uses the accent only where it is readable', () => {
      expect(accentHex({ background: 'ivory', textColor: 'olive' })).toBe('#9E5A44');
      expect(accentHex({ background: 'sage', textColor: 'black' })).toBe('#171717');
      expect(accentHex({ background: 'black', textColor: 'white' })).toBe('#FFFFFF');
    });
  });
});
