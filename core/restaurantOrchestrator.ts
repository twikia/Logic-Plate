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
export type RestaurantLoadStage =
  | 'reading-cache'
  | 'fetching-restaurants'
  | 'parsing-restaurants'
  | 'loading-overviews'
  | 'done';

export type RestaurantLoadProgress = {
  stage: RestaurantLoadStage;
  progress: number;
};

export const getNearbyRestaurants = async (
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onProgress?: (update: RestaurantLoadProgress) => void
) => {
  // Cap radius at 8km to avoid massive fetches
  const safeRadius = Math.min(radiusMeters, 8000);

  // 1. Get all overlapping H3 cells
  const cellIds = getCellsInRadius(userLat, userLng, safeRadius);
  if (cellIds.length === 0) {
    throw new Error('No search cells generated for current location.');
  }

  // 2. Bulk-read ALL cells from cache in two operations:
  //    - One AsyncStorage.multiGet (single JS bridge crossing) for L1
  //    - One Supabase .in() query for any L2 misses
  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits, misses: uncachedCells } = await readCacheBulk(cellIds);
  console.log(
    `Restaurant cache check complete: ${hits.size}/${cellIds.length} cells found in cache (local+db), ${uncachedCells.length} cells still missing.`
  );

  let allRestaurants: any[] = [];
  hits.forEach(restaurants => {
    allRestaurants = allRestaurants.concat(restaurants);
  });

  // 3. Fetch still-missing cells from Supabase Edge Function
  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });
    const missingCellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(`Database cache misses remain for ${uncachedCells.length} cells. Invoking edge function fetch-missing-cells...`);
    const { data, error } = await supabase.functions.invoke('fetch-missing-cells', {
      body: { missingCells: missingCellsPayload },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });

    if (error) {
      console.error('Edge Function returned an error:', error);
      if (allRestaurants.length === 0) {
        throw new Error(`Restaurant fetch failed: ${error.message || 'edge function invocation failed'}`);
      }
    } else if (data && Array.isArray(data.newlyFetchedRestaurants)) {
      console.log(`Edge function returned data for ${data.newlyFetchedRestaurants.length} cells.`);
      if (Array.isArray(data.failedCells) && data.failedCells.length > 0) {
        console.error('Edge function reported failed cells:', data.failedCells);
      }
      // Edge Function returns [{ cellId, places }]
      data.newlyFetchedRestaurants.forEach((result: { cellId: string, places: any[] }) => {
        // Write to local cache asynchronously so next time it's fast without hitting Supabase DB
        writeCache(result.cellId, result.places);
        allRestaurants = allRestaurants.concat(result.places);
      });
      if (allRestaurants.length === 0) {
        throw new Error('Restaurant fetch failed: edge function returned zero restaurants.');
      }
    } else if (allRestaurants.length === 0) {
      throw new Error('Restaurant fetch failed: edge function returned no data.');
    }
  }

  // 4. Deduplicate by Place ID using a Map (O(n), not O(n²))
  onProgress?.({ stage: 'parsing-restaurants', progress: 0.75 });
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

  onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
  const aiOverviews = await getAiOverviewsForPlaces(finalList);
  const enriched = finalList.map(place => {
    const aiOverview = place.id ? aiOverviews.get(place.id) : undefined;
    if (!aiOverview) return place;
    return {
      ...place,
      aiOverview,
      healthScore: aiOverview.healthScore,
    };
  });
  onProgress?.({ stage: 'done', progress: 1 });
  return enriched;
};


