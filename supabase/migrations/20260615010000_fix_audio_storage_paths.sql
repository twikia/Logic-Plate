-- storage_path is the object key inside the app-audio bucket, not the bucket name itself.
-- Strip accidental "app-audio/" prefixes from manual dashboard edits.

update public.app_audio_assets
set
  storage_path = regexp_replace(storage_path, '^app-audio/', ''),
  content_version = content_version + 1,
  updated_at = timezone('utc', now())
where storage_path like 'app-audio/%';

update public.app_audio_assets
set
  storage_path = 'mondamusic-food-food-cooking-music-512896.mp3',
  enabled = true,
  content_version = content_version + 1,
  updated_at = timezone('utc', now())
where slug = 'food-cooking-music';

update public.app_audio_assets
set
  storage_path = 'prettyjohn1-food-503901.mp3',
  enabled = true,
  content_version = content_version + 1,
  updated_at = timezone('utc', now())
where slug = 'food-ambient-503901';
