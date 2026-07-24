import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { pruneStorageCache, safeAsyncStorageMultiSet, safeAsyncStorageSet } from './resultCache';

export type CachedPlace = {
  id: string;
  name: string;
  category: string;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region?: string | null;
  postcode?: string | null;
  country: string | null;
  operating_status?: string | null;
  businessStatus?: string | null;
  priceTier?: number | null;
  regularOpeningHours?: { weekdayDescriptions: string[] } | null;
  brand?: string | null;
  wikidata?: string | null;
  sources?: Array<{ property?: string; dataset?: string; record_id?: string }> | null;
  attributes?: string[] | null;
  /** Overture existence confidence (0–1), when provided by the source. */
  confidence?: number | null;
  location: {
    latitude: number;
    longitude: number;
  };
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function normalizePlaceArray(raw: unknown): CachedPlace[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is CachedPlace =>
      item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      item.location?.latitude != null
  );
}

export const readCacheBulk = async (
  cellIds: string[],
): Promise<{ hits: Map<string, CachedPlace[]>; misses: string[] }> => {
  const now = Date.now();
  const hits = new Map<string, CachedPlace[]>();
  const l1MissCells: string[] = [];

  try {
    const storageKeys = cellIds.map(id => `v2_cell_${id}`);
    const pairs = await AsyncStorage.multiGet(storageKeys);

    for (const [key, value] of pairs) {
      const cellId = key.replace('v2_cell_', '');
      if (!value) {
        l1MissCells.push(cellId);
        continue;
      }
      try {
        const parsed = JSON.parse(value);
        const fetchedAt = new Date(parsed.fetched_at).getTime();
        const places = normalizePlaceArray(parsed.restaurants);
        if (now - fetchedAt < SEVEN_DAYS_MS && places.length > 0) {
          hits.set(cellId, places);
        } else {
          l1MissCells.push(cellId);
        }
      } catch {
        l1MissCells.push(cellId);
      }
    }
    console.log(`[Cache] AsyncStorage L1: ${hits.size} hits, ${l1MissCells.length} misses out of ${cellIds.length} cells`);
  } catch (err) {
    console.error('[Cache] AsyncStorage multiGet error:', err);
    cellIds.filter(id => !hits.has(id)).forEach(id => l1MissCells.push(id));
  }

  if (l1MissCells.length > 0) {
    try {
      const { data, error } = await supabase
        .from('v2_restaurant_cell_cache')
        .select('id, restaurants, fetched_at')
        .in('id', l1MissCells);

      if (error) {
        console.warn('[Cache] Supabase L2 read error:', error.message ?? error.code);
      }

      if (data && data.length > 0) {
        console.log(`[Cache] Supabase v2_restaurant_cell_cache: ${data.length} rows returned for ${l1MissCells.length} cells`);
        const backfillPairs: [string, string][] = [];

        for (const row of data) {
          const fetchedAt = new Date(row.fetched_at).getTime();
          const places = normalizePlaceArray(row.restaurants);
          if (now - fetchedAt < THIRTY_DAYS_MS && places.length > 0) {
            hits.set(row.id, places);
            backfillPairs.push([
              `v2_cell_${row.id}`,
              JSON.stringify({ restaurants: places, fetched_at: new Date().toISOString() }),
            ]);
          }
        }

        if (backfillPairs.length > 0) {
          await safeAsyncStorageMultiSet(backfillPairs);
        }
      } else {
        console.log(`[Cache] Supabase v2_restaurant_cell_cache: 0 rows returned for ${l1MissCells.length} cells`);
      }
    } catch (err) {
      console.warn('[Cache] Supabase bulk fetch error:', err instanceof Error ? err.message : String(err));
    }
  }

  const misses = cellIds.filter(id => !hits.has(id));
  return { hits, misses };
};

export const readCache = async (cellId: string): Promise<CachedPlace[] | null> => {
  const { hits } = await readCacheBulk([cellId]);
  return hits.get(cellId) ?? null;
};

export const writeCache = async (cellId: string, places: CachedPlace[]): Promise<void> => {
  const fetchedAt = new Date().toISOString();
  const clean = normalizePlaceArray(places);
  await pruneStorageCache();
  await safeAsyncStorageSet(
    `v2_cell_${cellId}`,
    JSON.stringify({ restaurants: clean, fetched_at: fetchedAt })
  );
};

export const clearLocalCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const v2CellKeys = keys.filter(k => k.startsWith('v2_cell_'));
    await AsyncStorage.multiRemove(v2CellKeys);
    console.log(`[Cache] Cleared ${v2CellKeys.length} cell entries from AsyncStorage`);
  } catch (err) {
    console.error('[Cache] AsyncStorage clear error:', err);
  }
};
