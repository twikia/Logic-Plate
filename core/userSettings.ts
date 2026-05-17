import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIUS_KEY = 'search_radius_meters';
const DISTANCE_UNIT_KEY = 'distance_unit';
const AUDIO_VOLUME_KEY = 'audio_volume';
const HAPTICS_KEY = 'haptics_enabled';
const THEME_KEY = 'app_theme';


const DEFAULT_RADIUS = 4000;
const DEFAULT_UNIT = 'km';
const DEFAULT_VOLUME = 0.5;
const DEFAULT_HAPTICS = true;
const DEFAULT_THEME = 'neon_dark';


export type DistanceUnit = 'km' | 'mi';

export const getSearchRadius = async (): Promise<number> => {
  try {
    const val = await AsyncStorage.getItem(RADIUS_KEY);
    return val ? parseInt(val, 10) : DEFAULT_RADIUS;
  } catch {
    return DEFAULT_RADIUS;
  }
};

export const setSearchRadius = async (meters: number): Promise<void> => {
  const clamped = Math.max(1000, Math.min(8000, meters));
  await AsyncStorage.setItem(RADIUS_KEY, String(clamped));
};

export const getDistanceUnit = async (): Promise<DistanceUnit> => {
  try {
    const val = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
    return (val as DistanceUnit) || DEFAULT_UNIT;
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

