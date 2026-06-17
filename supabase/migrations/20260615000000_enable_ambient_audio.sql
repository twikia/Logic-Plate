-- Enable ambient tracks and align storage_path with files in the app-audio bucket.
-- Files were uploaded at bucket root (not under ambient/).

insert into public.app_audio_assets (slug, title, storage_path, category, sort_order, enabled, content_version)
values
  (
    'food-cooking-music',
    'Food Cooking Music',
    'mondamusic-food-food-cooking-music-512896.mp3',
    'ambient',
    1,
    true,
    1
  ),
  (
    'food-ambient-503901',
    'Food Ambient',
    'prettyjohn1-food-503901.mp3',
    'ambient',
    2,
    true,
    1
  )
on conflict (slug) do update set
  title = excluded.title,
  storage_path = excluded.storage_path,
  sort_order = excluded.sort_order,
  enabled = true,
  content_version = excluded.content_version,
  updated_at = timezone('utc', now());
