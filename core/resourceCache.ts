import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { getPublicStorageUrl } from './remoteResources';

const LANG_CATALOG_CACHE_KEY = 'resource_cache:language_catalog_v1';
const TRANSLATION_CACHE_PREFIX = 'resource_cache:translation:';
const TRANSLATION_VERSION_PREFIX = 'resource_cache:translation_version:';
const AUDIO_CATALOG_CACHE_KEY = 'resource_cache:audio_catalog_v1';
const AUDIO_META_PREFIX = 'resource_cache:audio_meta:';

const AUDIO_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}ambient-audio/`;

export type CachedLanguageCatalog = {
  version: number;
  rows: Array<{
    code: string;
    native_name: string;
    english_name: string;
    sort_order: number;
  }>;
};

export type CachedAudioCatalog = {
  version: number;
  rows: Array<{
    slug: string;
    title: string;
    storage_path: string;
    sort_order: number;
    content_version: number;
  }>;
};

export async function readLanguageCatalogCache(): Promise<CachedLanguageCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(LANG_CATALOG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedLanguageCatalog) : null;
  } catch {
    return null;
  }
}

export async function writeLanguageCatalogCache(
  version: number,
  rows: CachedLanguageCatalog['rows']
): Promise<void> {
  await AsyncStorage.setItem(
    LANG_CATALOG_CACHE_KEY,
    JSON.stringify({ version, rows } satisfies CachedLanguageCatalog)
  );
}

export async function readTranslationCache(
  lang: string
): Promise<{ strings: Record<string, unknown>; version: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${TRANSLATION_CACHE_PREFIX}${lang}`);
    if (!raw) return null;
    return JSON.parse(raw) as { strings: Record<string, unknown>; version: number };
  } catch {
    return null;
  }
}

export async function writeTranslationCache(
  lang: string,
  strings: Record<string, unknown>,
  version: number
): Promise<void> {
  await AsyncStorage.setItem(
    `${TRANSLATION_CACHE_PREFIX}${lang}`,
    JSON.stringify({ strings, version })
  );
  await AsyncStorage.setItem(`${TRANSLATION_VERSION_PREFIX}${lang}`, String(version));
}

export async function readCachedTranslationVersion(lang: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(`${TRANSLATION_VERSION_PREFIX}${lang}`);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

export async function readAudioCatalogCache(): Promise<CachedAudioCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(AUDIO_CATALOG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedAudioCatalog) : null;
  } catch {
    return null;
  }
}

export async function writeAudioCatalogCache(
  version: number,
  rows: CachedAudioCatalog['rows']
): Promise<void> {
  await AsyncStorage.setItem(
    AUDIO_CATALOG_CACHE_KEY,
    JSON.stringify({ version, rows } satisfies CachedAudioCatalog)
  );
}

function audioLocalPath(slug: string): string {
  return `${AUDIO_CACHE_DIR}${slug}.mp3`;
}

export async function getCachedAudioUri(
  slug: string,
  storagePath: string,
  contentVersion: number
): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getPublicStorageUrl(storagePath);
  }

  const localPath = audioLocalPath(slug);
  const metaKey = `${AUDIO_META_PREFIX}${slug}`;

  try {
    const rawMeta = await AsyncStorage.getItem(metaKey);
    if (rawMeta) {
      const meta = JSON.parse(rawMeta) as { version: number; path: string };
      if (meta.version === contentVersion) {
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists) return localPath;
      }
    }

    const remoteUrl = getPublicStorageUrl(storagePath);
    if (!remoteUrl) return null;

    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true });
    const result = await FileSystem.downloadAsync(remoteUrl, localPath);
    await AsyncStorage.setItem(
      metaKey,
      JSON.stringify({ version: contentVersion, path: result.uri })
    );
    return result.uri;
  } catch {
    const remoteUrl = getPublicStorageUrl(storagePath);
    return remoteUrl || null;
  }
}

export async function prefetchAudioTrack(
  slug: string,
  storagePath: string,
  contentVersion: number
): Promise<void> {
  await getCachedAudioUri(slug, storagePath, contentVersion);
}
