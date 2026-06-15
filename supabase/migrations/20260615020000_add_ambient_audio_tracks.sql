insert into public.app_audio_assets (slug, title, storage_path, category, sort_order, enabled, content_version)
values
  (
    'emotional-ambient-pop',
    'Emotional Ambient Pop',
    'rockot-eona-emotional-ambient-pop-351436.mp3',
    'ambient',
    3,
    true,
    1
  ),
  (
    'food-cooking-music-447264',
    'Food Cooking Music',
    'delosound-food-cooking-music-447264.mp3',
    'ambient',
    4,
    true,
    1
  ),
  (
    'food-cooking-music-512899',
    'Food Cooking Music',
    'mondamusic-food-cooking-music-512899.mp3',
    'ambient',
    5,
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
