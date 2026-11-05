-- Seller storefront customization (Issue #21).
--
-- Adds a tagline and the storefront style settings to public.profiles.
-- Everything is stored as palette KEYS, never as hex values or CSS.
-- Existing profiles keep working: they receive the defaults, which match
-- the current storefront (Ivory background, Olive text, Plus Jakarta Sans
-- medium name at the existing responsive size, regular tagline, classic
-- image corners).
--
-- Row Level Security is unchanged: "Anyone can view profiles" lets the public
-- storefront read these columns, and the existing owner-only INSERT and
-- UPDATE policies (auth.uid() = id) already cover them.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tagline text,
ADD COLUMN IF NOT EXISTS storefront_background text NOT NULL DEFAULT 'ivory',
ADD COLUMN IF NOT EXISTS storefront_text_color text NOT NULL DEFAULT 'olive',
ADD COLUMN IF NOT EXISTS storefront_name_font text NOT NULL DEFAULT 'plus_jakarta_sans',
ADD COLUMN IF NOT EXISTS storefront_name_weight smallint NOT NULL DEFAULT 500,
-- NULL keeps the existing responsive default name size.
ADD COLUMN IF NOT EXISTS storefront_name_size smallint,
ADD COLUMN IF NOT EXISTS storefront_tagline_style text NOT NULL DEFAULT 'regular',
ADD COLUMN IF NOT EXISTS storefront_image_shape text NOT NULL DEFAULT 'classic';

-- Optional single-line plain text, at most 80 characters.
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_tagline_check
CHECK (
  tagline IS NULL
  OR (
    char_length(tagline) <= 80
    AND tagline !~ '[[:cntrl:]]'
  )
);

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_background_check
CHECK (
  storefront_background IN (
    'ivory',
    'warm_sand',
    'sage',
    'dusty_rose',
    'soft_blue',
    'olive',
    'terracotta',
    'cobalt_blue',
    'black'
  )
);

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_text_color_check
CHECK (
  storefront_text_color IN (
    'black',
    'white',
    'charcoal',
    'olive',
    'terracotta',
    'cobalt',
    'burgundy',
    'cream'
  )
);

-- Both self-hosted fonts are variable fonts that support every weight below.
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_name_font_check
CHECK (storefront_name_font IN ('plus_jakarta_sans', 'noto_serif'));

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_name_weight_check
CHECK (storefront_name_weight IN (300, 400, 500, 600, 700, 800));

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_name_size_check
CHECK (
  storefront_name_size IS NULL
  OR storefront_name_size BETWEEN 28 AND 128
);

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_tagline_style_check
CHECK (storefront_tagline_style IN ('regular', 'italic'));

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_image_shape_check
CHECK (storefront_image_shape IN ('classic', 'soft', 'circle'));

-- WCAG AA: text must have a contrast ratio of at least 4.5:1 on the
-- background. These are the 33 passing (background, text) pairs out of 72.
-- The list is generated from the palettes in
-- src/app/models/storefront-theme.ts. Keep both in sync: a unit test
-- (storefront-theme.spec.ts) pins the same list.
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_storefront_contrast_check
CHECK (
  (storefront_background, storefront_text_color) IN (
    ('ivory', 'black'),
    ('ivory', 'charcoal'),
    ('ivory', 'olive'),
    ('ivory', 'terracotta'),
    ('ivory', 'cobalt'),
    ('ivory', 'burgundy'),
    ('warm_sand', 'black'),
    ('warm_sand', 'charcoal'),
    ('warm_sand', 'olive'),
    ('warm_sand', 'cobalt'),
    ('warm_sand', 'burgundy'),
    ('sage', 'black'),
    ('sage', 'charcoal'),
    ('sage', 'cobalt'),
    ('sage', 'burgundy'),
    ('dusty_rose', 'black'),
    ('dusty_rose', 'charcoal'),
    ('dusty_rose', 'olive'),
    ('dusty_rose', 'cobalt'),
    ('dusty_rose', 'burgundy'),
    ('soft_blue', 'black'),
    ('soft_blue', 'charcoal'),
    ('soft_blue', 'olive'),
    ('soft_blue', 'cobalt'),
    ('soft_blue', 'burgundy'),
    ('olive', 'white'),
    ('olive', 'cream'),
    ('terracotta', 'white'),
    ('terracotta', 'cream'),
    ('cobalt_blue', 'white'),
    ('cobalt_blue', 'cream'),
    ('black', 'white'),
    ('black', 'cream')
  )
);
