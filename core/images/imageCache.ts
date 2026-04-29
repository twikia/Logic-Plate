import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Image Cache — Centralized image URL resolution, fallback cycling, and caching.
 * 
 * Decoupled from all UI components. Restaurant cards import the hook from
 * RestaurantImage.tsx, which uses this module internally.
 */

const CACHE_PREFIX = 'imgcache_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory LRU — avoids AsyncStorage reads on repeated renders
const memoryCache = new Map<string, string>();
const MAX_MEMORY = 200;

// ─── URL Resolution ──────────────────────────────────────────────────────────

/**
 * Extracts a usable image URL from a Google Places photo object.
 * Handles string photos, object photos with various key names, and nested URLs.
 */
export const resolvePhotoUri = (photo: any): string | null => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo;

  // Direct known keys — ordered by most common first
  if (typeof photo.url === 'string' && photo.url.length > 0) return photo.url;
  if (typeof photo.uri === 'string' && photo.uri.length > 0) return photo.uri;
  if (typeof photo.photoUri === 'string' && photo.photoUri.length > 0) return photo.photoUri;

  // Google Places New API: photo.name like "places/xxx/photos/yyy"
  if (typeof photo.name === 'string' && photo.name.startsWith('places/')) {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || process.env.EXPO_PUBLIC_MAPS_API_KEY;
    const keyParam = key ? `&key=${key}` : '';
    return `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800${keyParam}`;
  }

  // Last resort: any string value that looks like a URL
  for (const key of Object.keys(photo)) {
    const val = photo[key];
    if (typeof val === 'string' && val.startsWith('http')) {
      return val;
    }
  }

  console.warn('[ImageCache] Could not resolve any URL from photo object:', JSON.stringify(photo).slice(0, 200));
  return null;
};

/**
 * Builds a list of candidate URLs from a restaurant's photos array.
 * Returns an ordered list: first photo first, then fallbacks.
 */
export const buildCandidateUrls = (photos: any[]): string[] => {
  if (!photos || !Array.isArray(photos)) return [];

  const urls: string[] = [];
  for (const photo of photos) {
    const uri = resolvePhotoUri(photo);
    if (uri) urls.push(uri);
  }

  return urls;
};

// ─── Quality Adjustment ──────────────────────────────────────────────────────

/**
 * Adjusts the maxWidthPx / maxwidth param of a Google Places photo URL.
 */
export const adjustQuality = (uri: string, maxPx: number): string => {
  if (!uri) return uri;
  if (uri.includes('maxWidthPx=')) {
    return uri.replace(/maxWidthPx=\d+/, `maxWidthPx=${maxPx}`);
  }
  if (uri.includes('maxwidth=')) {
    return uri.replace(/maxwidth=\d+/, `maxwidth=${maxPx}`);
  }
  if (uri.includes('maxHeightPx=')) {
    return uri.replace(/maxHeightPx=\d+/, `maxHeightPx=${maxPx}`);
  }
  if (uri.includes('maxheight=')) {
    return uri.replace(/maxheight=\d+/, `maxheight=${maxPx}`);
  }
  const joiner = uri.includes('?') ? '&' : '?';
  return `${uri}${joiner}maxWidthPx=${maxPx}`;
};

// ─── Persistent Cache ────────────────────────────────────────────────────────

/**
 * Saves a successfully-loaded URL to both memory and AsyncStorage.
 * Future renders for the same restaurant skip the fallback waterfall entirely.
 */
export const cacheImageUrl = async (restaurantId: string, url: string): Promise<void> => {
  // Memory — instant
  if (memoryCache.size >= MAX_MEMORY) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(restaurantId, url);

  // Disk — fire and forget
  try {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}${restaurantId}`,
      JSON.stringify({ url, ts: Date.now() })
    );
  } catch (err) {
    console.error('[ImageCache] Failed to persist URL:', err);
  }
};

/**
 * Reads a previously cached URL for a restaurant.
 * Returns null if not cached or expired.
 */
export const getCachedImageUrl = async (restaurantId: string): Promise<string | null> => {
  // Memory hit — no async needed
  const mem = memoryCache.get(restaurantId);
  if (mem) return mem;

  // Disk
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${restaurantId}`);
    if (!raw) return null;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;

    // Backfill memory
    memoryCache.set(restaurantId, url);
    return url;
  } catch {
    return null;
  }
};

/**
 * Clears all cached image URLs (memory + disk).
 * Called from dev cache-clear and when the user manually refreshes.
 */
export const clearImageCache = async (): Promise<void> => {
  memoryCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const imgKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (imgKeys.length > 0) {
      await AsyncStorage.multiRemove(imgKeys);
    }
    console.log(`[ImageCache] Cleared ${imgKeys.length} cached image URLs.`);
  } catch (err) {
    console.error('[ImageCache] Clear error:', err);
  }
};
