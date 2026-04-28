import { getCellsInRadius, getCellCenter } from './h3Utils';
import { readCache, writeCache } from './cacheManager';
import { fetchRestaurantsFromGoogle } from './googlePlaces';

/**
 * Computes the great-circle distance between two points on a sphere given their longitudes and latitudes
 */
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Phase 6: Cache Orchestrator
 * Master function to fetch nearby restaurants efficiently.
 */
export const getNearbyRestaurants = async (userLat: number, userLng: number, radiusMeters: number) => {
  // Cap radius at 5km to avoid massive fetches
  const safeRadius = Math.min(radiusMeters, 5000);
  
  // 1. Get all overlapping H3 cells
  const cellIds = getCellsInRadius(userLat, userLng, safeRadius);
  
  // 2. Read from Cache in parallel
  const cachePromises = cellIds.map(async (cellId) => {
    const cachedData = await readCache(cellId);
    return { cellId, data: cachedData };
  });
  
  const cacheResults = await Promise.all(cachePromises);
  
  const cachedCells = cacheResults.filter(r => r.data !== null);
  const uncachedCells = cacheResults.filter(r => r.data === null).map(r => r.cellId);
  
  // 3. Fetch missing cells from Google (Concurrency limit: 3)
  const newlyFetchedRestaurants: Record<string, any[]> = {};
  
  const fetchTasks = uncachedCells.map((cellId) => async () => {
    const [cellLat, cellLng] = getCellCenter(cellId);
    try {
      const places = await fetchRestaurantsFromGoogle(cellLat, cellLng);
      newlyFetchedRestaurants[cellId] = places;
      // Write back to cache asynchronously (don't block the return)
      writeCache(cellId, places);
    } catch (error) {
      console.error(`Failed to fetch places for cell ${cellId}:`, error);
      newlyFetchedRestaurants[cellId] = []; // Fallback to empty array on failure
    }
  });

  // Run tasks with concurrency limit of 3
  const executing: Promise<void>[] = [];
  for (const task of fetchTasks) {
    const p = task().then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= 3) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  // 4. Merge all arrays into one flat list
  let allRestaurants: any[] = [];
  
  cachedCells.forEach(c => {
    if (c.data) allRestaurants = allRestaurants.concat(c.data);
  });
  
  Object.values(newlyFetchedRestaurants).forEach(places => {
    allRestaurants = allRestaurants.concat(places);
  });

  // 5. Deduplicate by Place ID
  const uniqueRestaurantsMap = new Map<string, any>();
  allRestaurants.forEach(place => {
    if (place.id && !uniqueRestaurantsMap.has(place.id)) {
      uniqueRestaurantsMap.set(place.id, place);
    }
  });
  const uniqueRestaurants = Array.from(uniqueRestaurantsMap.values());

  // 6. Compute exact distance, filter by requested radius, and sort
  const finalList = uniqueRestaurants
    .map(place => {
      if (!place.location || !place.location.latitude || !place.location.longitude) {
        return { ...place, distanceMeters: Infinity };
      }
      const distance = haversineDistance(
        userLat,
        userLng,
        place.location.latitude,
        place.location.longitude
      );
      return { ...place, distanceMeters: distance };
    })
    .filter(place => place.distanceMeters <= safeRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return finalList;
};
