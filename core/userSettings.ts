import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIUS_KEY = 'search_radius_meters';
const DEFAULT_RADIUS = 2000;

export const getSearchRadius = async (): Promise<number> => {
  try {
    const val = await AsyncStorage.getItem(RADIUS_KEY);
    return val ? parseInt(val, 10) : DEFAULT_RADIUS;
  } catch {
    return DEFAULT_RADIUS;
  }
};

export const setSearchRadius = async (meters: number): Promise<void> => {
  const clamped = Math.max(1000, Math.min(5000, meters));
  await AsyncStorage.setItem(RADIUS_KEY, String(clamped));
};
