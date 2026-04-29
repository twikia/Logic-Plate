import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getCachedResults = async (cuisineKey: string): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(`resultscache_${cuisineKey}`);
    if (!raw) return null;
    const { results, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > TTL_MS) return null;
    return results;
  } catch {
    return null;
  }
};

export const setCachedResults = async (cuisineKey: string, results: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      `resultscache_${cuisineKey}`,
      JSON.stringify({ results, timestamp: Date.now() })
    );
  } catch (e) {
    console.error('resultCache write error:', e);
  }
};
