-- App resources: languages, remote translations, and ambient audio catalog.
-- Translations for en/es/fr are seeded in the follow-up migration.
-- Upload ambient MP3s to the app-audio storage bucket, then enable rows in app_audio_assets.

-- ─── Languages catalog (top 30 by speakers) ───────────────────────────────────

create table if not exists public.app_languages (
  code text primary key,
  native_name text not null,
  english_name text not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.app_languages (code, native_name, english_name, sort_order) values
  ('en', 'English', 'English', 1),
  ('zh', '中文', 'Chinese (Mandarin)', 2),
  ('hi', 'हिन्दी', 'Hindi', 3),
  ('es', 'Español', 'Spanish', 4),
  ('fr', 'Français', 'French', 5),
  ('ar', 'العربية', 'Arabic', 6),
  ('bn', 'বাংলা', 'Bengali', 7),
  ('pt', 'Português', 'Portuguese', 8),
  ('ru', 'Русский', 'Russian', 9),
  ('ur', 'اردو', 'Urdu', 10),
  ('id', 'Bahasa Indonesia', 'Indonesian', 11),
  ('de', 'Deutsch', 'German', 12),
  ('ja', '日本語', 'Japanese', 13),
  ('sw', 'Kiswahili', 'Swahili', 14),
  ('mr', 'मराठी', 'Marathi', 15),
  ('te', 'తెలుగు', 'Telugu', 16),
  ('tr', 'Türkçe', 'Turkish', 17),
  ('ta', 'தமிழ்', 'Tamil', 18),
  ('vi', 'Tiếng Việt', 'Vietnamese', 19),
  ('ko', '한국어', 'Korean', 20),
  ('it', 'Italiano', 'Italian', 21),
  ('th', 'ไทย', 'Thai', 22),
  ('gu', 'ગુજરાતી', 'Gujarati', 23),
  ('pl', 'Polski', 'Polish', 24),
  ('uk', 'Українська', 'Ukrainian', 25),
  ('ml', 'മലയാളം', 'Malayalam', 26),
  ('kn', 'ಕನ್ನಡ', 'Kannada', 27),
  ('pa', 'ਪੰਜਾਬੀ', 'Punjabi', 28),
  ('nl', 'Nederlands', 'Dutch', 29),
  ('ro', 'Română', 'Romanian', 30)
on conflict (code) do update set
  native_name = excluded.native_name,
  english_name = excluded.english_name,
  sort_order = excluded.sort_order;

alter table public.app_languages enable row level security;

drop policy if exists "app_languages_public_read" on public.app_languages;
create policy "app_languages_public_read"
  on public.app_languages
  for select
  to anon, authenticated
  using (enabled = true);

-- ─── Translation strings (lazy-loaded by the app) ────────────────────────────

create table if not exists public.app_translations (
  lang_code text primary key references public.app_languages (code) on delete cascade,
  strings jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_translations enable row level security;

drop policy if exists "app_translations_public_read" on public.app_translations;
create policy "app_translations_public_read"
  on public.app_translations
  for select
  to anon, authenticated
  using (true);

-- ─── Ambient audio catalog (UI sounds stay bundled in the app) ───────────────

create table if not exists public.app_audio_assets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  storage_path text not null,
  category text not null default 'ambient'
    check (category in ('ambient')),
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_audio_assets_category_enabled_idx
  on public.app_audio_assets (category, enabled, sort_order);

alter table public.app_audio_assets enable row level security;

drop policy if exists "app_audio_assets_public_read" on public.app_audio_assets;
create policy "app_audio_assets_public_read"
  on public.app_audio_assets
  for select
  to anon, authenticated
  using (enabled = true);

-- Placeholder rows — upload MP3s to storage, then set enabled = true.
insert into public.app_audio_assets (slug, title, storage_path, category, sort_order, enabled) values
  (
    'food-cooking-music',
    'Food Cooking Music',
    'ambient/mondamusic-food-food-cooking-music-512896.mp3',
    'ambient',
    1,
    false
  ),
  (
    'food-ambient-503901',
    'Food Ambient',
    'ambient/prettyjohn1-food-503901.mp3',
    'ambient',
    2,
    false
  )
on conflict (slug) do nothing;

-- ─── Storage bucket for ambient audio ────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-audio',
  'app-audio',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "app_audio_public_read" on storage.objects;
create policy "app_audio_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'app-audio');
