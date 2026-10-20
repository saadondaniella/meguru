CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
  display_name text,
  bio text,
  city text,
  contact_email text,
  instagram text,

  CONSTRAINT profiles_display_name_length
    CHECK (char_length(display_name) <= 50),

  CONSTRAINT profiles_bio_length
    CHECK (char_length(bio) <= 500),

  CONSTRAINT profiles_city_length
    CHECK (char_length(city) <= 50),

  CONSTRAINT profiles_contact_email_length
    CHECK (char_length(contact_email) <= 254),

  CONSTRAINT profiles_instagram_length
    CHECK (
      instagram IS NULL
      OR instagram = ''
      OR instagram ~ '^@?[A-Za-z0-9._]{1,30}$'
    )
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);