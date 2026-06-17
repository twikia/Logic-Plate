import { supabase } from './supabaseClient';

export const AUDIO_BUCKET = 'app-audio';

export type AppLanguage = {
  code: string;
  native_name: string;
  english_name: string;
  sort_order: number;
};

export type AmbientAudioAsset = {
  slug: string;
  title: string;
  storage_path: string;
  sort_order: number;
  content_version: number;
};

export function getPublicStorageUrl(storagePath: string): string {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) return '';
  let path = storagePath.replace(/^\/+/, '');
  if (path.startsWith(`${AUDIO_BUCKET}/`)) {
    path = path.slice(AUDIO_BUCKET.length + 1);
  }
  return `${base}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`;
}

export async function fetchLanguageCatalogVersion(): Promise<number> {
  const { data, error } = await supabase
    .from('app_languages')
    .select('updated_at')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const stamp = data?.[0]?.updated_at;
  return stamp ? new Date(stamp).getTime() : 0;
}

export async function fetchAppLanguages(): Promise<AppLanguage[]> {
  const { data, error } = await supabase
    .from('app_languages')
    .select('code, native_name, english_name, sort_order')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AppLanguage[];
}

export async function fetchTranslationVersion(langCode: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('app_languages')
    .select('translation_version, strings')
    .eq('code', langCode)
    .maybeSingle();

  if (error) throw error;
  if (!data?.strings) return null;
  return data.translation_version ?? 1;
}

export async function fetchTranslation(
  langCode: string
): Promise<{ strings: Record<string, unknown>; version: number } | null> {
  const { data, error } = await supabase
    .from('app_languages')
    .select('strings, translation_version')
    .eq('code', langCode)
    .maybeSingle();

  if (error) throw error;
  if (!data?.strings) return null;
  return {
    strings: data.strings as Record<string, unknown>,
    version: data.translation_version ?? 1,
  };
}

export async function fetchAudioCatalogVersion(): Promise<number> {
  const { data, error } = await supabase
    .from('app_audio_assets')
    .select('content_version, updated_at')
    .eq('category', 'ambient')
    .eq('enabled', true);

  if (error) throw error;
  if (!data?.length) return 0;

  let version = data.length * 1000;
  for (const row of data) {
    version += row.content_version ?? 1;
    if (row.updated_at) {
      version += new Date(row.updated_at).getTime() % 100000;
    }
  }
  return version;
}

export async function fetchAmbientAudioAssets(): Promise<AmbientAudioAsset[]> {
  const { data, error } = await supabase
    .from('app_audio_assets')
    .select('slug, title, storage_path, sort_order, content_version')
    .eq('category', 'ambient')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AmbientAudioAsset[];
}
