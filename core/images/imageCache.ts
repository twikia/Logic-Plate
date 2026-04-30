import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';

/**
 * Image Cache — Three-tier restaurant photo URL resolution and caching.
 *
 * Tier 1: OG image from the restaurant's own website  (~65% coverage, specific)
 * Tier 2: Mapillary street-level exterior shot         (~50% in cities, real location)
 * Tier 3: Unsplash cuisine-category photo             (100% coverage, generic but beautiful)
 *
 * All URLs are stored permanently — no ToS issues with any source.
 * Joined on google_place_id in `restaurant_photo_cache`.
 */

// ─── Cache Constants ─────────────────────────────────────────────────────────

const CACHE_PREFIX        = 'imgcache_';
const CACHE_TTL_MS        = 24 * 60 * 60 * 1000;          // 24h per-image URL cache

const PHOTO_CACHE_PREFIX  = 'restphotos_';
const PHOTO_CACHE_TTL_MS  = 45 * 24 * 60 * 60 * 1000;    // 45 days — permanent-ish

// In-memory LRU — avoids AsyncStorage reads on repeated renders
const memoryCache = new Map<string, string>();
const MAX_MEMORY  = 200;

// ─── URL Resolution ───────────────────────────────────────────────────────────

/**
 * Extracts a usable image URL from a photo object (string, Google Places object,
 * or any object with a url/uri/photoUri key).
 */
export const resolvePhotoUri = (photo: any): string | null => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo;

  if (typeof photo.url === 'string' && photo.url.length > 0)         return photo.url;
  if (typeof photo.uri === 'string' && photo.uri.length > 0)         return photo.uri;
  if (typeof photo.photoUri === 'string' && photo.photoUri.length > 0) return photo.photoUri;

  for (const key of Object.keys(photo)) {
    const val = photo[key];
    if (typeof val === 'string' && val.startsWith('http')) return val;
  }

  console.warn('[ImageCache] Could not resolve URL from photo:', JSON.stringify(photo).slice(0, 200));
  return null;
};

/**
 * Builds an ordered list of candidate URLs from a photos array.
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
 * Non-Google URLs are returned as-is.
 */
export const adjustQuality = (uri: string, maxPx: number): string => {
  if (!uri) return uri;
  if (uri.includes('maxWidthPx=')) return uri.replace(/maxWidthPx=\d+/, `maxWidthPx=${maxPx}`);
  if (uri.includes('maxwidth='))   return uri.replace(/maxwidth=\d+/,   `maxwidth=${maxPx}`);
  if (uri.includes('maxHeightPx=')) return uri.replace(/maxHeightPx=\d+/, `maxHeightPx=${maxPx}`);
  if (uri.includes('maxheight='))  return uri.replace(/maxheight=\d+/,  `maxheight=${maxPx}`);
  // Non-Google URLs: no param to adjust — return as-is
  return uri;
};

// ─── Per-image URL Cache (for RestaurantImage component) ─────────────────────

/**
 * Saves the first successfully-loaded image URL for a given restaurant render ID.
 * This prevents the fallback waterfall from re-running on every render.
 */
export const cacheImageUrl = async (restaurantId: string, url: string): Promise<void> => {
  if (memoryCache.size >= MAX_MEMORY) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(restaurantId, url);

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
 * Reads a previously cached image URL. Returns null if not found or expired.
 */
export const getCachedImageUrl = async (restaurantId: string): Promise<string | null> => {
  const mem = memoryCache.get(restaurantId);
  if (mem) return mem;

  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${restaurantId}`);
    if (!raw) return null;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    memoryCache.set(restaurantId, url);
    return url;
  } catch {
    return null;
  }
};

// ─── Photo URL List Cache (for three-tier photo lists) ───────────────────────

/**
 * Clears all cached image data (memory + disk).
 */
export const clearImageCache = async (): Promise<void> => {
  memoryCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const imgKeys = keys.filter(k =>
      k.startsWith(CACHE_PREFIX) ||
      k.startsWith(PHOTO_CACHE_PREFIX) ||
      k.startsWith('fsqphotos_')  // legacy key cleanup
    );
    if (imgKeys.length > 0) await AsyncStorage.multiRemove(imgKeys);
    console.log(`[ImageCache] Cleared ${imgKeys.length} local image cache entries.`);
  } catch (err) {
    console.error('[ImageCache] Clear error:', err);
  }
};

/**
 * Wipes the remote restaurant_photo_cache table (service_role required).
 * Useful for forcing a full re-fetch during development.
 */
export const clearRemotePhotoCache = async (): Promise<void> => {
  try {
    const { error } = await supabase
      .from('restaurant_photo_cache')
      .delete()
      .neq('google_place_id', '_');

    if (error) console.error('[ImageCache] Remote photo cache clear failed:', error);
    else console.log('[ImageCache] Remote restaurant_photo_cache wiped.');
  } catch (err) {
    console.error('[ImageCache] Remote clear error:', err);
  }
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchRestaurantPhotosInput = {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  websiteUrl?: string;
  cuisineKey?: string;
};

type RestaurantPhotoCacheRow = {
  google_place_id: string;
  og_urls:         string[] | null;
  mapillary_urls:  string[] | null;
  unsplash_urls:   string[] | null;
  photo_urls:      string[] | null;
  cuisine_key:     string | null;
  updated_at:      string;
};

// ─── Main Fetch Function ──────────────────────────────────────────────────────

/**
 * Returns the ordered list of photo URLs for a restaurant, running the three-tier
 * fallback pipeline if necessary and caching results locally + in Supabase.
 *
 * Priority: Local AsyncStorage → Supabase DB → Edge Function (live fetch).
 *
 * Photo order returned:  OG image → Mapillary → Unsplash
 * Max photos:            4 (or 1 Unsplash-only if Tiers 1+2 both return 0)
 */
export const fetchRestaurantPhotoUrls = async ({
  placeId,
  name,
  latitude,
  longitude,
  websiteUrl,
  cuisineKey,
}: FetchRestaurantPhotosInput): Promise<string[]> => {
  if (!placeId || !name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.error('[ImageCache] fetch skipped — invalid input:', { placeId, name, latitude, longitude });
    return [];
  }

  const localKey = `${PHOTO_CACHE_PREFIX}${placeId}`;

  // ── L1: Local AsyncStorage ────────────────────────────────────────────────
  try {
    const raw = await AsyncStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { photo_urls?: string[]; ts?: number };
      if (parsed?.ts && Date.now() - parsed.ts < PHOTO_CACHE_TTL_MS && Array.isArray(parsed.photo_urls)) {
        console.log(`[ImageCache] Local cache hit for ${placeId} (${parsed.photo_urls.length} urls)`);
        return parsed.photo_urls;
      }
    }
  } catch (err) {
    console.error('[ImageCache] Local cache read error:', err);
  }

  // ── L2: Supabase DB ────────────────────────────────────────────────────────
  const { data, error: dbError } = await supabase
    .from('restaurant_photo_cache')
    .select('google_place_id, og_urls, mapillary_urls, unsplash_urls, photo_urls, cuisine_key, updated_at')
    .eq('google_place_id', placeId)
    .maybeSingle();

  if (dbError) {
    console.error('[ImageCache] DB lookup error:', dbError);
  }

  const cached = data as RestaurantPhotoCacheRow | null;
  if (cached?.updated_at) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < PHOTO_CACHE_TTL_MS) {
      const urls = Array.isArray(cached.photo_urls) ? cached.photo_urls : [];
      console.log(`[ImageCache] DB cache hit for ${placeId} (${urls.length} urls)`);
      // Backfill local cache
      AsyncStorage.setItem(localKey, JSON.stringify({ photo_urls: urls, ts: Date.now() }))
        .catch(e => console.error('[ImageCache] Local backfill write error:', e));
      return urls;
    }
  }

  // ── L3: Edge Function (live fetch from all three sources) ─────────────────
  console.log(`[ImageCache] Calling fetch-restaurant-photos for "${name}" (${placeId})`);
  const { data: invoked, error: invokeError } = await supabase.functions.invoke('fetch-restaurant-photos', {
    body: {
      place_id:    placeId,
      name,
      latitude,
      longitude,
      website_url: websiteUrl ?? null,
      cuisine_key: cuisineKey ?? null,
    },
    headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET ?? '' },
  });

  if (invokeError) {
    console.error('[ImageCache] Edge function invoke error:', invokeError);
    return [];
  }

  const urls: string[] = Array.isArray(invoked?.photo_urls) ? invoked.photo_urls : [];
  console.log(`[ImageCache] Edge function returned ${urls.length} URLs for ${placeId}`);

  // Persist locally
  AsyncStorage.setItem(localKey, JSON.stringify({ photo_urls: urls, ts: Date.now() }))
    .catch(e => console.error('[ImageCache] Local write after edge error:', e));

  return urls;
};
