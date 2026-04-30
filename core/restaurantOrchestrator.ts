import { getCellsInRadius, getCellCenter } from './h3Utils';
import { readCacheBulk, writeCache } from './cacheManager';
import { supabase } from './supabaseClient';
import { getAiOverviewsForPlaces } from './aiOverviewCache';

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
 * Phase 6: Cache Orchestrator — Optimized with bulk cache reads.
 * Master function to fetch nearby restaurants efficiently using Supabase Edge Functions.
 */
export const getNearbyRestaurants = async (userLat: number, userLng: number, radiusMeters: number) => {
  // Cap radius at 8km to avoid massive fetches
  const safeRadius = Math.min(radiusMeters, 8000);

  // 1. Get all overlapping H3 cells
  const cellIds = getCellsInRadius(userLat, userLng, safeRadius);

  // 2. Bulk-read ALL cells from cache in two operations:
  //    - One AsyncStorage.multiGet (single JS bridge crossing) for L1
  //    - One Supabase .in() query for any L2 misses
  const { hits, misses: uncachedCells } = await readCacheBulk(cellIds);

  let allRestaurants: any[] = [];
  hits.forEach(restaurants => {
    allRestaurants = allRestaurants.concat(restaurants);
  });

  // 3. Fetch still-missing cells from Supabase Edge Function
  if (uncachedCells.length > 0) {
    const missingCellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(`Invoking Edge Function to fetch ${uncachedCells.length} missing cells...`);
    const { data, error } = await supabase.functions.invoke('fetch-missing-cells', {
      body: { missingCells: missingCellsPayload },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
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

  // 4. Deduplicate by Place ID using a Map (O(n), not O(n²))
  const uniqueRestaurantsMap = new Map<string, any>();
  for (const place of allRestaurants) {
    if (place.id && !uniqueRestaurantsMap.has(place.id)) {
      uniqueRestaurantsMap.set(place.id, place);
    }
  }

  // 5. Compute exact distance, filter by requested radius, and sort
  const finalList = Array.from(uniqueRestaurantsMap.values())
    .map(place => {
      if (!place.location?.latitude || !place.location?.longitude) {
        return { ...place, distanceMeters: Infinity };
      }
      return {
        ...place,
        distanceMeters: haversineDistance(
          userLat, userLng,
          place.location.latitude,
          place.location.longitude
        ),
      };
    })
    .filter(place => place.distanceMeters <= safeRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const aiOverviews = await getAiOverviewsForPlaces(finalList);
  return finalList.map(place => {
    const aiOverview = place.id ? aiOverviews.get(place.id) : undefined;
    if (!aiOverview) return place;
    return {
      ...place,
      aiOverview,
      healthScore: aiOverview.healthScore,
    };
  });
};


