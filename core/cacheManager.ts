import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

/**
 * Phase 3: Cache Read/Write Module
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * BULK cache reader. Fetches all requested cell IDs using:
 *  - ONE AsyncStorage.multiGet call  (single JS bridge crossing for L1)
 *  - ONE Supabase .in() query        (single network round-trip for L2 misses)
 *
 * Returns a map of { cellId -> restaurants[] } for all valid hits.
 * Cell IDs with no valid/fresh cache entry appear in `misses`.
 */
export const readCacheBulk = async (
  cellIds: string[],
  resolution: number = 8
): Promise<{ hits: Map<string, any[]>; misses: string[] }> => {
  const now = Date.now();
  const hits = new Map<string, any[]>();
  const l1MissCells: string[] = [];

  // ── L1: Single multiGet across the JS bridge ──────────────────────────────
  try {
    const storageKeys = cellIds.map(id => `cell_${id}`);
    const pairs = await AsyncStorage.multiGet(storageKeys);

    for (const [key, value] of pairs) {
      const cellId = key.replace('cell_', '');
      if (!value) {
        l1MissCells.push(cellId);
        continue;
      }
      try {
        const parsed = JSON.parse(value);
        const fetchedAt = new Date(parsed.fetched_at).getTime();
        if (now - fetchedAt < SEVEN_DAYS_MS && Array.isArray(parsed.restaurants) && parsed.restaurants.length > 0) {
          hits.set(cellId, parsed.restaurants);
        } else {
          l1MissCells.push(cellId);
        }
      } catch {
        l1MissCells.push(cellId);
      }
    }
  } catch (err) {
    console.error('AsyncStorage multiGet error:', err);
    cellIds.filter(id => !hits.has(id)).forEach(id => l1MissCells.push(id));
  }

  // ── L2: Single Supabase .in() query for all L1 misses ────────────────────
  if (l1MissCells.length > 0) {
    try {
      let tableName = 'restaurant_cache';
      if (resolution === 7) tableName = 'restaurant_cache_res7';
      if (resolution === 6) tableName = 'restaurant_cache_res6';

      const { data, error } = await supabase
        .from(tableName)
        .select('id, restaurants, fetched_at')
        .in('id', l1MissCells);

      if (error) {
        console.warn(
          'Supabase bulk read error:',
          error.message ?? error.code ?? JSON.stringify(error)
        );
      }

      if (data && data.length > 0) {
        const backfillPairs: [string, string][] = [];

        for (const row of data) {
          const fetchedAt = new Date(row.fetched_at).getTime();
          if (now - fetchedAt < THIRTY_DAYS_MS && Array.isArray(row.restaurants) && row.restaurants.length > 0) {
            hits.set(row.id, row.restaurants);
            backfillPairs.push([
              `cell_${row.id}`,
              JSON.stringify({ restaurants: row.restaurants, fetched_at: new Date().toISOString() }),
            ]);
          }
        }

        if (backfillPairs.length > 0) {
          try {
            await AsyncStorage.multiSet(backfillPairs);
          } catch (e) {
            console.error('AsyncStorage multiSet backfill error:', e);
          }
        }
      }
    } catch (err) {
      console.warn(
        'Supabase bulk fetch error:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const misses = cellIds.filter(id => !hits.has(id));
  return { hits, misses };
};

/**
 * Single-cell read (kept for legacy/edge use — prefer readCacheBulk for batches).
 */
export const readCache = async (cellId: string, resolution: number = 8): Promise<any[] | null> => {
  const { hits } = await readCacheBulk([cellId], resolution);
  return hits.get(cellId) ?? null;
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
