import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const IMG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PHOTO_CACHE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const MAX_RESULT_CACHE_ENTRIES = 2;
const MAX_CELL_ENTRIES = 12;
const MAX_IMG_CACHE_ENTRIES = 60;
const MAX_PHOTO_LIST_ENTRIES = 20;

export function isStorageFullError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('SQLITE_FULL') || msg.includes('disk is full') || msg.includes('code 13');
}

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

async function prunePrefixEntries(
  prefix: string,
  maxEntries: number,
  getTimestamp: (parsed: any) => number | null,
  ttlMs?: number
): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const prefixKeys = keys.filter(k => k.startsWith(prefix));
  if (prefixKeys.length === 0) return [];

  const pairs = await AsyncStorage.multiGet(prefixKeys);
  const now = Date.now();
  const keysToRemove: string[] = [];
  const valid: { key: string; timestamp: number }[] = [];

  for (const [key, val] of pairs) {
    if (!val) {
      keysToRemove.push(key);
      continue;
    }
    try {
      const parsed = JSON.parse(val);
      const ts = getTimestamp(parsed);
      if (ts == null || (ttlMs != null && now - ts > ttlMs)) {
        keysToRemove.push(key);
      } else {
        valid.push({ key, timestamp: ts });
      }
    } catch {
      keysToRemove.push(key);
    }
  }

  if (valid.length > maxEntries) {
    valid.sort((a, b) => b.timestamp - a.timestamp);
    for (let i = maxEntries; i < valid.length; i++) {
      keysToRemove.push(valid[i].key);
    }
  }

  return keysToRemove;
}

/**
 * Prunes stale or excess entries from AsyncStorage to prevent SQLITE_FULL errors.
 */
export const pruneStorageCache = async (): Promise<void> => {
  try {
    const removals = new Set<string>();

    for (const key of await prunePrefixEntries(
      'resultscache_',
      MAX_RESULT_CACHE_ENTRIES,
      parsed => parsed.timestamp || 0,
      TTL_MS
    )) {
      removals.add(key);
    }

    for (const key of await prunePrefixEntries(
      'cell_',
      MAX_CELL_ENTRIES,
      parsed => {
        const t = new Date(parsed.fetched_at).getTime();
        return Number.isNaN(t) ? null : t;
      },
      SEVEN_DAYS_MS
    )) {
      removals.add(key);
    }

    for (const key of await prunePrefixEntries(
      'imgcache_',
      MAX_IMG_CACHE_ENTRIES,
      parsed => parsed.ts || 0,
      IMG_CACHE_TTL_MS
    )) {
      removals.add(key);
    }

    for (const key of await prunePrefixEntries(
      'restphotos_',
      MAX_PHOTO_LIST_ENTRIES,
      parsed => parsed.ts || 0,
      PHOTO_CACHE_TTL_MS
    )) {
      removals.add(key);
    }

    if (removals.size > 0) {
      await AsyncStorage.multiRemove([...removals]);
    }
  } catch {
    // ignore pruning error
  }
};

/**
 * Drops all disposable local caches when routine pruning cannot free enough space.
 */
export const aggressiveStorageCleanup = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k =>
      k.startsWith('resultscache_') ||
      k.startsWith('imgcache_') ||
      k.startsWith('restphotos_') ||
      k.startsWith('fsqphotos_')
    );

    const cellKeys = keys.filter(k => k.startsWith('cell_'));
    if (cellKeys.length > 6) {
      const pairs = await AsyncStorage.multiGet(cellKeys);
      const ranked: { key: string; fetchedAt: number }[] = [];
      for (const [key, val] of pairs) {
        if (!val) {
          toRemove.push(key);
          continue;
        }
        try {
          const parsed = JSON.parse(val);
          const t = new Date(parsed.fetched_at).getTime();
          ranked.push({ key, fetchedAt: Number.isNaN(t) ? 0 : t });
        } catch {
          toRemove.push(key);
        }
      }
      ranked.sort((a, b) => b.fetchedAt - a.fetchedAt);
      for (let i = 6; i < ranked.length; i++) {
        toRemove.push(ranked[i].key);
      }
    }

    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove([...new Set(toRemove)]);
    }
  } catch {
    // ignore cleanup error
  }
};

export async function safeAsyncStorageSet(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isStorageFullError(err)) return false;
    await pruneStorageCache();
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch {
      await aggressiveStorageCleanup();
      try {
        await AsyncStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export async function safeAsyncStorageMultiSet(pairs: [string, string][]): Promise<boolean> {
  if (pairs.length === 0) return true;
  try {
    await AsyncStorage.multiSet(pairs);
    return true;
  } catch (err) {
    if (!isStorageFullError(err)) return false;
    await pruneStorageCache();
    try {
      await AsyncStorage.multiSet(pairs);
      return true;
    } catch {
      await aggressiveStorageCleanup();
      try {
        await AsyncStorage.multiSet(pairs);
        return true;
      } catch {
        return false;
      }
    }
  }
}

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

  await pruneStorageCache();
  const ok = await safeAsyncStorageSet(`resultscache_${cuisineKey}`, payload);
  if (!ok) {
    console.warn('resultCache write skipped — local storage full');
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
