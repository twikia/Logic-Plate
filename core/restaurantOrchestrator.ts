import { getCellsInRadius, getCellCenter } from './h3Utils';
import { readCache, writeCache } from './cacheManager';
import { supabase } from './supabaseClient';

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
 * Master function to fetch nearby restaurants efficiently using Supabase Edge Functions.
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
  
  let allRestaurants: any[] = [];
  
  cachedCells.forEach(c => {
    if (c.data) allRestaurants = allRestaurants.concat(c.data);
  });

  // 3. Fetch missing cells from Supabase Edge Function
  if (uncachedCells.length > 0) {
    const missingCellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(`Invoking Edge Function to fetch ${uncachedCells.length} missing cells...`);
    const { data, error } = await supabase.functions.invoke('fetch-missing-cells', {
      body: { missingCells: missingCellsPayload }
    });

    if (error) {
      console.error('Edge Function returned an error:', error);
    } else if (data && data.newlyFetchedRestaurants) {
      // Edge Function returns [{ cellId, places }]
      data.newlyFetchedRestaurants.forEach((result: { cellId: string, places: any[] }) => {
        // Write to local cache asynchronously so next time it's fast without hitting Supabase DB
        writeCache(result.cellId, result.places);
        allRestaurants = allRestaurants.concat(result.places);
      });
    }
  }

  // 4. Deduplicate by Place ID
  const uniqueRestaurantsMap = new Map<string, any>();
  allRestaurants.forEach(place => {
    if (place.id && !uniqueRestaurantsMap.has(place.id)) {
      uniqueRestaurantsMap.set(place.id, place);
    }
  });
  const uniqueRestaurants = Array.from(uniqueRestaurantsMap.values());

  // 5. Compute exact distance, filter by requested radius, and sort
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
