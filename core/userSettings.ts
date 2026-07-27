import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SEARCH_RADIUS_METERS } from './searchRadiusOptions';

export type DistanceUnit = 'km' | 'mi';

const DISTANCE_UNIT_KEY = 'distance_unit';
const SFX_VOLUME_KEY = 'sfx_volume';
const MUSIC_VOLUME_KEY = 'music_volume';
const LEGACY_AUDIO_VOLUME_KEY = 'audio_volume';
const HAPTICS_KEY = 'haptics_enabled';
const THEME_KEY = 'app_theme';
const LANGUAGE_KEY = 'app_language';
const DEFAULT_UNIT: DistanceUnit = 'km';

const MILES_REGIONS = new Set([
  'US',
  'GB',
  'UK',
  'MM',
  'LR',
  'PR',
  'VI',
  'GU',
  'AS',
  'MP',
]);

export function inferDistanceUnitFromLocale(): DistanceUnit {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).pop()?.toUpperCase() ?? '';
    return MILES_REGIONS.has(region) ? 'mi' : 'km';
  } catch {
    return DEFAULT_UNIT;
  }
}

export async function initDistanceUnit(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
    if (existing === 'km' || existing === 'mi') return;
    await AsyncStorage.setItem(DISTANCE_UNIT_KEY, inferDistanceUnitFromLocale());
  } catch {
    // keep default
  }
}
const DEFAULT_SFX_VOLUME = 0.5;
const DEFAULT_MUSIC_VOLUME = 0.5;
const DEFAULT_HAPTICS = true;
const DEFAULT_THEME = 'neon_dark';

export const getSearchRadius = async (): Promise<number> => DEFAULT_SEARCH_RADIUS_METERS;

export const getDistanceUnit = async (): Promise<DistanceUnit> => {
  try {
    const val = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
    if (val === 'km' || val === 'mi') return val;
    return inferDistanceUnitFromLocale();
  } catch {
    return DEFAULT_UNIT;
  }
};

export const setDistanceUnit = async (unit: DistanceUnit): Promise<void> => {
  await AsyncStorage.setItem(DISTANCE_UNIT_KEY, unit);
};

async function readVolume(key: string, defaultVolume: number): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(key);
    if (val) return parseFloat(val);
    const legacy = await AsyncStorage.getItem(LEGACY_AUDIO_VOLUME_KEY);
    return legacy ? parseFloat(legacy) : defaultVolume;
  } catch {
    return defaultVolume;
  }
}

export const getSfxVolume = async (): Promise<number> => readVolume(SFX_VOLUME_KEY, DEFAULT_SFX_VOLUME);

export const setSfxVolume = async (volume: number): Promise<void> => {
  await AsyncStorage.setItem(SFX_VOLUME_KEY, String(volume));
};

export const getMusicVolume = async (): Promise<number> =>
  readVolume(MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME);

export const setMusicVolume = async (volume: number): Promise<void> => {
  await AsyncStorage.setItem(MUSIC_VOLUME_KEY, String(volume));
};

export const getHapticsEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem(HAPTICS_KEY);
    return val !== null ? val === 'true' : DEFAULT_HAPTICS;
  } catch {
    return DEFAULT_HAPTICS;
  }
};

export const setHapticsEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(HAPTICS_KEY, String(enabled));
};

export const getTheme = async (): Promise<string> => {
  try {
    const val = await AsyncStorage.getItem(THEME_KEY);
    return val || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const setTheme = async (theme: string): Promise<void> => {
  await AsyncStorage.setItem(THEME_KEY, theme);
};

export const getLanguage = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

export const setLanguage = async (lang: string): Promise<void> => {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
};

const BYPASS_LOCAL_CACHE_KEY = 'dev_bypass_local_cache';
let bypassLocalCacheMemory: boolean | null = null;

export async function getBypassLocalCache(): Promise<boolean> {
  if (bypassLocalCacheMemory !== null) return bypassLocalCacheMemory;
  try {
    bypassLocalCacheMemory = (await AsyncStorage.getItem(BYPASS_LOCAL_CACHE_KEY)) === 'true';
  } catch {
    bypassLocalCacheMemory = false;
  }
  return bypassLocalCacheMemory;
}

export function isBypassLocalCacheEnabled(): boolean {
  return bypassLocalCacheMemory === true;
}

export async function setBypassLocalCache(enabled: boolean): Promise<void> {
  bypassLocalCacheMemory = enabled;
  await AsyncStorage.setItem(BYPASS_LOCAL_CACHE_KEY, enabled ? 'true' : 'false');
}

export async function initBypassLocalCache(): Promise<void> {
  await getBypassLocalCache();
}
