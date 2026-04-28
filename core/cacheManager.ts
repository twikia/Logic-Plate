import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

/**
 * Phase 3: Cache Read/Write Module
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reads from AsyncStorage first (7 days). If miss, reads from Supabase (30 days).
 * On Supabase hit, backfills AsyncStorage. Returns null on total miss/stale.
 */
export const readCache = async (cellId: string): Promise<any[] | null> => {
  const now = Date.now();

  // 1. Check AsyncStorage (L1 Cache)
  try {
    const localData = await AsyncStorage.getItem(`cell_${cellId}`);
    if (localData) {
      const parsed = JSON.parse(localData);
      const fetchedAt = new Date(parsed.fetched_at).getTime();
      if (now - fetchedAt < SEVEN_DAYS_MS) {
        return parsed.restaurants;
      }
    }
  } catch (err) {
    console.error('AsyncStorage read error:', err);
  }

  // 2. Check Supabase (L2 Cache)
  try {
    const { data, error } = await supabase
      .from('restaurant_cache')
      .select('restaurants, fetched_at')
      .eq('id', cellId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows returned"
      console.error('Supabase read error:', error);
    }

    if (data) {
      const fetchedAt = new Date(data.fetched_at).getTime();
      if (now - fetchedAt < THIRTY_DAYS_MS) {
        // Backfill AsyncStorage
        try {
          await AsyncStorage.setItem(
            `cell_${cellId}`,
            JSON.stringify({
              restaurants: data.restaurants,
              fetched_at: data.fetched_at,
            })
          );
        } catch (e) {
          console.error('AsyncStorage backfill error:', e);
        }
        return data.restaurants;
      }
    }
  } catch (err) {
    console.error('Supabase fetch error:', err);
  }

  // Miss or completely stale
  return null;
};

/**
 * Writes ONLY to AsyncStorage (L1). Supabase (L2) is handled by the Edge Function.
 */
export const writeCache = async (cellId: string, restaurants: any[]) => {
  const fetchedAt = new Date().toISOString();
  const cachePayload = { restaurants, fetched_at: fetchedAt };

  try {
    await AsyncStorage.setItem(`cell_${cellId}`, JSON.stringify(cachePayload));
  } catch (err) {
    console.error('AsyncStorage write error:', err);
  }
};

/**
 * Clears the local AsyncStorage cache (useful for testing the Edge Function).
 */
export const clearLocalCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cellKeys = keys.filter(k => k.startsWith('cell_'));
    await AsyncStorage.multiRemove(cellKeys);
    console.log(`Cleared ${cellKeys.length} cells from local cache.`);
  } catch (err) {
    console.error('AsyncStorage clear error:', err);
  }
};
