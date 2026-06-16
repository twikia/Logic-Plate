import * as Location from 'expo-location';

/**
 * In-memory location cache.
 *
 * Getting a GPS fix can take several seconds with high accuracy.
 * We prefer a fast approximate fix (last known position when fresh, then Low accuracy)
 * so the app can search nearby quickly; accuracy within tens of meters is enough here. Since every screen independently
 * was calling requestForegroundPermissionsAsync + getCurrentPositionAsync on every
 * mount, navigating back and forth caused a full GPS re-acquisition every time.
 *
 * This module caches the last known coords for 3 minutes so subsequent screen
 * visits are instant. On a refresh/pull-to-refresh, call getLocation(true) to bypass.
 */

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

let cachedCoords: { latitude: number; longitude: number } | null = null;
let cachedAt = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

let pendingLocationPromise: Promise<{ latitude: number; longitude: number } | null> | null = null;

export const getLocation = async (
  force = false
): Promise<{ latitude: number; longitude: number } | null> => {
  // 1. If a request is already in progress, wait for it instead of starting a new one
  if (pendingLocationPromise) {
    console.log('GPS request already in progress, waiting for it...');
    return pendingLocationPromise;
  }

  // 2. Return cached coords if still fresh (and not forcing)
  if (!force && cachedCoords && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedCoords;
  }

  // 3. Start a new request and track it
  pendingLocationPromise = (async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      console.log('Starting fresh GPS acquisition...');
      let loc = await Location.getLastKnownPositionAsync({
        maxAge: 120_000,
      });
      const last = loc?.coords;
      const lastOk =
        last &&
        Number.isFinite(last.latitude) &&
        Number.isFinite(last.longitude) &&
        Math.abs(last.latitude) <= 90 &&
        Math.abs(last.longitude) <= 180;
      if (!lastOk) {
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
      }
      if (!loc?.coords) {
        return null;
      }

      cachedCoords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      cachedAt = Date.now();
      return cachedCoords;
    } catch (err) {
      console.error('GPS acquisition failed:', err);
      return null;
    } finally {
      pendingLocationPromise = null;
    }
  })();

  return pendingLocationPromise;
};

/**
 * Initializes the background location cache.
 * Fetches location immediately and sets up an interval to refresh every 3 minutes.
 */
export const initLocationCache = () => {
  // Initial fetch
  getLocation(true);

  if (!refreshInterval) {
    refreshInterval = setInterval(() => {
      getLocation(true);
    }, CACHE_TTL_MS);
  }
};

/**
 * Clears the in-memory location cache.
 */
export const clearLocationCache = () => {
  cachedCoords = null;
  cachedAt = 0;
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

