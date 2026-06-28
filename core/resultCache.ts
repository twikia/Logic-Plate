import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalizes client places array to flatten any legacy nested paging structures.
 */
function normalizeClientPlaces(raw: any): any[] {
  if (!raw) return [];
  let target = raw;
  if (!Array.isArray(target)) {
    if (target && typeof target === 'object') {
      if (Array.isArray(target.restaurants)) target = target.restaurants;
      else if (Array.isArray(target.pages)) target = target.pages;
      else if (Array.isArray(target.places)) target = target.places;
      else if (Array.isArray(target.results)) target = target.results;
      else return [];
    } else {
      return [];
    }
  }

  const flat: any[] = [];
  const flatten = (arr: any[]) => {
    for (const item of arr) {
      if (Array.isArray(item)) flatten(item);
      else if (item && typeof item === 'object') {
        if (Array.isArray(item.places)) flatten(item.places);
        else if (item.id || item.name || item.displayName) flat.push(item);
      }
    }
  };
  flatten(target);

  const seen = new Set<string>();
  const deduplicated: any[] = [];
  for (const p of flat) {
    const key = String(p.id || p.name || '');
    if (key && !seen.has(key)) {
      seen.add(key);
      deduplicated.push(p);
    }
  }
  return deduplicated;
}

/**
 * Prunes stale or excess entries from AsyncStorage to prevent SQLITE_FULL errors.
 */
export const pruneStorageCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const now = Date.now();
    const keysToRemove: string[] = [];

    // Prune resultscache_*
    const resultKeys = keys.filter(k => k.startsWith('resultscache_'));
    if (resultKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(resultKeys);
      const validResults: { key: string; timestamp: number }[] = [];
      for (const [k, val] of pairs) {
        if (!val) {
          keysToRemove.push(k);
          continue;
        }
        try {
          const parsed = JSON.parse(val);
          if (now - (parsed.timestamp || 0) > TTL_MS) {
            keysToRemove.push(k);
          } else {
            validResults.push({ key: k, timestamp: parsed.timestamp || 0 });
          }
        } catch {
          keysToRemove.push(k);
        }
      }
      if (validResults.length > 3) {
        validResults.sort((a, b) => b.timestamp - a.timestamp);
        for (let i = 3; i < validResults.length; i++) {
          keysToRemove.push(validResults[i].key);
        }
      }
    }

    // Prune old cell_* entries (keep at most 40 most recent cells)
    const cellKeys = keys.filter(k => k.startsWith('cell_'));
    if (cellKeys.length > 40) {
      const cellPairs = await AsyncStorage.multiGet(cellKeys);
      const validCells: { key: string; fetchedAt: number }[] = [];
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      for (const [k, val] of cellPairs) {
        if (!val) {
          keysToRemove.push(k);
          continue;
        }
        try {
          const parsed = JSON.parse(val);
          const t = new Date(parsed.fetched_at).getTime();
          if (isNaN(t) || now - t > SEVEN_DAYS_MS) {
            keysToRemove.push(k);
          } else {
            validCells.push({ key: k, fetchedAt: t });
          }
        } catch {
          keysToRemove.push(k);
        }
      }
      if (validCells.length > 40) {
        validCells.sort((a, b) => b.fetchedAt - a.fetchedAt);
        for (let i = 40; i < validCells.length; i++) {
          keysToRemove.push(validCells[i].key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // ignore pruning error
  }
};

export const getCachedResults = async (cuisineKey: string): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(`resultscache_${cuisineKey}`);
    if (!raw) return null;
    const { results, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > TTL_MS) return null;
    return normalizeClientPlaces(results);
  } catch {
    return null;
  }
};

export const setCachedResults = async (cuisineKey: string, results: any[]): Promise<void> => {
  const cleanResults = normalizeClientPlaces(results);
  const payload = JSON.stringify({ results: cleanResults, timestamp: Date.now() });

  try {
    await pruneStorageCache();
    await AsyncStorage.setItem(`resultscache_${cuisineKey}`, payload);
  } catch (e: any) {
    console.warn('resultCache write error, attempting aggressive cleanup:', e);
    try {
      await clearResultCache();
      await AsyncStorage.setItem(`resultscache_${cuisineKey}`, payload);
    } catch (retryError) {
      console.error('resultCache final write error:', retryError);
    }
  }
};

export const clearResultCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const resultKeys = keys.filter(k => k.startsWith('resultscache_'));
    await AsyncStorage.multiRemove(resultKeys);
  } catch (e) {
    console.error('resultCache clear error:', e);
  }
};

