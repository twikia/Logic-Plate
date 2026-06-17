# Audio Assets

## UI Sounds (`ui/`) — bundled in the app

Short MP3 effects stay in the repo and ship with the app. Register them in `app/_layout.tsx` via `registerUiSound()`.

## Ambient Music — Supabase Storage + on-device cache

The MP3 **files live in Supabase**, not in the app package:

1. **Upload** the MP3 to Supabase → Storage → bucket **`app-audio`** (e.g. `my-track.mp3` at the bucket root, or `ambient/my-track.mp3` in a subfolder).
2. **Register** the track in **`app_audio_assets`** with `enabled = true` and a `storage_path` that matches the upload location inside the bucket:

```sql
insert into public.app_audio_assets (slug, title, storage_path, category, sort_order, enabled, content_version)
values ('my-track', 'My Track', 'my-track.mp3', 'ambient', 1, true, 1);
```

Both steps are required — uploading alone does not start playback. Rows seeded by migrations start with `enabled = false` until you enable them.

On first play the app **downloads the file once** to the device cache (`expo-file-system` cache directory). Later sessions play from disk. Bump `content_version` when you replace a file so clients re-download.

The `storage_path` column is the file path **inside** the `app-audio` bucket — do **not** include the bucket name.

| File location in bucket | `storage_path` value |
|-------------------------|----------------------|
| `my-track.mp3` (bucket root) | `my-track.mp3` |
| `ambient/my-track.mp3` (subfolder) | `ambient/my-track.mp3` |
| Wrong | `app-audio/my-track.mp3` |

The app builds the download URL as: `{SUPABASE_URL}/storage/v1/object/public/app-audio/{storage_path}`

## Translations — one Supabase table

All language data is in **`app_languages`**:

| Column | Purpose |
|--------|---------|
| `code`, `native_name`, `english_name` | Shown in the language picker (small, cached once) |
| `strings` | Full UI JSON for that language (downloaded once per language, cached in AsyncStorage) |
| `translation_version` | Bump to push updated strings to clients |

English (`en`) also ships in the app bundle as offline fallback. Other languages load from Supabase on first use.

There used to be a separate `app_translations` table; migration `20260614140000` merges it into `app_languages`.

## Regenerating translation seeds

```bash
npm run generate-translation-seed
```

Then update `supabase/migrations/20260614130000_seed_app_translations.sql` (or run equivalent `UPDATE app_languages SET strings = ...` after the merge migration).
