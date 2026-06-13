import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SEARCH_RADIUS_METERS } from './searchRadiusOptions';

export type DistanceUnit = 'km' | 'mi';

const DISTANCE_UNIT_KEY = 'distance_unit';
const AUDIO_VOLUME_KEY = 'audio_volume';
const HAPTICS_KEY = 'haptics_enabled';
const THEME_KEY = 'app_theme';
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
const DEFAULT_VOLUME = 0.5;
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

export const getAudioVolume = async (): Promise<number> => {
  try {
    const val = await AsyncStorage.getItem(AUDIO_VOLUME_KEY);
    return val ? parseFloat(val) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
};

export const setAudioVolume = async (volume: number): Promise<void> => {
  await AsyncStorage.setItem(AUDIO_VOLUME_KEY, String(volume));
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
