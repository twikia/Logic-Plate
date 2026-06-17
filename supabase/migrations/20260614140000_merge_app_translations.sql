-- Merge app_translations into app_languages (one table for metadata + strings).
-- Add content_version on audio rows for local cache invalidation.

alter table public.app_languages
  add column if not exists strings jsonb,
  add column if not exists translation_version int not null default 1,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.app_languages l
set
  strings = t.strings,
  translation_version = t.version,
  updated_at = t.updated_at
from public.app_translations t
where l.code = t.lang_code;

drop table if exists public.app_translations;

alter table public.app_audio_assets
  add column if not exists content_version int not null default 1;

comment on column public.app_languages.strings is
  'UI translation JSON. NULL until translated. English ships in the app bundle.';

comment on column public.app_audio_assets.storage_path is
  'Path inside the app-audio storage bucket where the MP3 file lives.';

comment on column public.app_audio_assets.content_version is
  'Bump when replacing the file so clients re-download.';
