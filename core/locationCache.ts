import * as Location from 'expo-location';

const USE_HARDCODED_DENVER_LOCATION = true;
const HARDCODED_DENVER_COORDS = { latitude: 39.7392, longitude: -104.9903 };

/**
 * In-memory location cache.
 *
 * Getting a GPS fix (Location.getCurrentPositionAsync) can take 3-10 seconds,
 * especially on Android with Balanced accuracy. Since every screen independently
 * was calling requestForegroundPermissionsAsync + getCurrentPositionAsync on every
 * mount, navigating back and forth caused a full GPS re-acquisition every time.
 *
 * This module caches the last known coords for 3 minutes so subsequent screen
 * visits are instant. On a refresh/pull-to-refresh, call getLocation(true) to bypass.
 */

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

let cachedCoords: { latitude: number; longitude: number } | null = null;
let cachedAt = 0;
let refreshInterval: NodeJS.Timeout | null = null;

let pendingLocationPromise: Promise<{ latitude: number; longitude: number } | null> | null = null;

export const getLocation = async (
  force = false
): Promise<{ latitude: number; longitude: number } | null> => {
  if (USE_HARDCODED_DENVER_LOCATION) {
    cachedCoords = HARDCODED_DENVER_COORDS;
    cachedAt = Date.now();
    return HARDCODED_DENVER_COORDS;
  }

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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

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

