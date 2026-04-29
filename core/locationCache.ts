import * as Location from 'expo-location';

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

export const getLocation = async (
  force = false
): Promise<{ latitude: number; longitude: number } | null> => {
  // Return cached coords if still fresh
  if (!force && cachedCoords && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedCoords;
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  cachedCoords = {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
  cachedAt = Date.now();
  return cachedCoords;
};

/**
 * Clears the in-memory location cache.
 */
export const clearLocationCache = () => {
  cachedCoords = null;
  cachedAt = 0;
};

