import { getCellsInRadiusDynamic, getCellCenter, getChildCells } from './h3Utils';
import { SEARCH_CONFIG } from './searchConfig';
import { readCacheBulk, writeCache, type CachedPlace } from './cacheManager';
import { supabase } from './supabaseClient';
import { logEdgeFunctionFailure } from './supabaseFunctionErrors';
import { checkIsPopulatedArea } from './geoRestriction';
import {
  getCachedAiOverviewsForPlaces,
  invokeGenerateAiOverviewsForPlaces,
  mergeAiOverviewsOntoPlaces,
  type PlaceSeed,
} from './aiOverviewCache';

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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

export class RestaurantLoadSupersededError extends Error {
  readonly name = 'RestaurantLoadSupersededError';
  constructor() { super('Restaurant load superseded'); }
}

export const RESTAURANT_FETCH_USER_MESSAGE =
  "Couldn't load nearby restaurants. Check your connection and try again.";

export class RestaurantFetchError extends Error {
  readonly name = 'RestaurantFetchError';
  constructor(message = RESTAURANT_FETCH_USER_MESSAGE, readonly cause?: unknown) {
    super(message);
  }
}

export const isRestaurantLoadSupersededError = (e: unknown): boolean =>
  e instanceof RestaurantLoadSupersededError;

export const isRestaurantFetchError = (e: unknown): e is RestaurantFetchError =>
  e instanceof RestaurantFetchError;

export type GetNearbyRestaurantsOptions = {
  onAiReady?: (places: any[]) => void;
  onPlacesUpdated?: (places: any[]) => void;
  waitForAi?: boolean;
};

let latestJobSeq = 0;

type QueuedTask = {
  userLat: number;
  userLng: number;
  radiusMeters: number;
  onProgress?: (update: RestaurantLoadProgress) => void;
  options?: GetNearbyRestaurantsOptions;
  resolve: (places: any[]) => void;
  reject: (e: unknown) => void;
};

let fetchActive = false;
let fetchPending: QueuedTask | null = null;

type FetchRestaurantsPayload = {
  cells: Array<{ cellId: string; lat?: number; lng?: number }>;
  resolution: number;
};

type FetchRestaurantsResponse = {
  newlyFetchedRestaurants: { cellId: string; places: CachedPlace[] }[];
  failedCells?: { cellId: string; reason: string }[];
  totalPlacesReturned: number;
};

async function invokeFetchRestaurants(
  payload: FetchRestaurantsPayload
): Promise<{ data: FetchRestaurantsResponse | null; error: any }> {
  try {
    const result = await supabase.functions.invoke('v2-fetch-restaurants', {
      body: payload,
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });
    return { data: result.data as FetchRestaurantsResponse | null, error: result.error };
  } catch (err) {
    return { data: null, error: err };
  }
}

const formatAndSortPlaces = (
  rawPlaces: CachedPlace[],
  userLat: number,
  userLng: number,
  safeRadius: number
): CachedPlace[] => {
  const uniqueMap = new Map<string, CachedPlace>();
  for (const place of rawPlaces) {
    if (place.id && !uniqueMap.has(place.id)) {
      uniqueMap.set(place.id, place);
    }
  }

  return Array.from(uniqueMap.values())
    .map(place => {
      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      if (!lat || !lng) return { ...place, distanceMeters: Infinity };
      return { ...place, distanceMeters: haversineDistance(userLat, userLng, lat, lng) };
    })
    .filter(place => place.distanceMeters <= safeRadius)
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
};

const toPlaceSeed = (place: CachedPlace): PlaceSeed => ({
  id: place.id,
  name: place.name,
  website_url: place.website_url,
  address: place.address,
  city: place.city,
  category: place.category,
  location: place.location,
  phone: place.phone,
});

async function loadNearbyRestaurantsInternal(
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onProgress?: (update: RestaurantLoadProgress) => void,
  options?: GetNearbyRestaurantsOptions
): Promise<any[]> {
  const jobSeq = ++latestJobSeq;
  const safeRadius = Math.min(radiusMeters, SEARCH_CONFIG.MAX_RADIUS_METERS);

  const { cellIds, resolution } = getCellsInRadiusDynamic(userLat, userLng, safeRadius);
  if (cellIds.length === 0) {
    throw new RestaurantFetchError('No search cells generated for current location.');
  }

  const isPopulated = await checkIsPopulatedArea(userLat, userLng);
  if (!isPopulated) {
    console.log(
      `[GeoRestriction] Location (${userLat}, ${userLng}) identified as 0 population / middle of nowhere. Skipping searches.`
    );
    onProgress?.({ stage: 'done', progress: 1.0 });
    return [];
  }

  console.log(`[Orchestrator] Starting restaurant load: ${cellIds.length} cells at resolution ${resolution}`);

  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits: rawHits, misses: uncachedCells } = await readCacheBulk(cellIds, resolution);

  console.log(`[Orchestrator] Cell cache check: ${rawHits.size}/${cellIds.length} cells hit, ${uncachedCells.length} cells missing`);

  let allPlaces: CachedPlace[] = [];
  rawHits.forEach(places => { allPlaces = allPlaces.concat(places); });

  if (resolution < 8 && uncachedCells.length > 0) {
    const childRes = resolution === 7 ? 8 : 7;
    const childCellIds: string[] = [];
    for (const id of uncachedCells) {
      childCellIds.push(...getChildCells(id, childRes));
    }
    const { hits: childHits } = await readCacheBulk(childCellIds, childRes);
    childHits.forEach(places => { allPlaces = allPlaces.concat(places); });
    console.log(`[Orchestrator] Child cache (res ${childRes}): ${childHits.size} child cells merged`);
  }

  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });

    const cellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(`[Orchestrator] Invoking v2-fetch-restaurants for ${cellsPayload.length} uncached cells...`);

    const { data, error } = await invokeFetchRestaurants({ cells: cellsPayload, resolution });

    if (error) {
      logEdgeFunctionFailure('v2-fetch-restaurants', { data, error });
      if (allPlaces.length === 0) {
        throw new RestaurantFetchError(undefined, error);
      }
    } else if (data && Array.isArray(data.newlyFetchedRestaurants)) {
      const returnedCount = data.totalPlacesReturned ??
        data.newlyFetchedRestaurants.reduce((sum, r) => sum + (r.places?.length || 0), 0);
      console.log(`[Orchestrator] v2-fetch-restaurants returned ${returnedCount} places across ${data.newlyFetchedRestaurants.length} cells`);

      if (Array.isArray(data.failedCells) && data.failedCells.length > 0) {
        console.warn('[Orchestrator] Edge function reported failed cells:', data.failedCells);
      }

      for (const result of data.newlyFetchedRestaurants) {
        await writeCache(result.cellId, result.places);
        allPlaces = allPlaces.concat(result.places);
      }

      if (allPlaces.length === 0) {
        throw new RestaurantFetchError(undefined, 'v2-fetch-restaurants returned zero places');
      }
    } else if (allPlaces.length === 0) {
      throw new RestaurantFetchError(undefined, 'v2-fetch-restaurants returned no data');
    }
  }

  if (allPlaces.length === 0) {
    throw new RestaurantFetchError(undefined, 'no restaurant data available');
  }

  onProgress?.({ stage: 'parsing-restaurants', progress: 0.75 });
  const finalList = formatAndSortPlaces(allPlaces, userLat, userLng, safeRadius);
  console.log(`[Orchestrator] After dedupe/sort/filter: ${finalList.length} restaurants within ${safeRadius}m`);

  const seeds = finalList.map(toPlaceSeed);
  const cachedAi = await getCachedAiOverviewsForPlaces(seeds);
  const baseList = mergeAiOverviewsOntoPlaces(finalList, cachedAi);
  console.log(`[Orchestrator] AI overview cache: ${cachedAi.size}/${finalList.length} already enriched`);

  const triggerUpdates = (enriched: any[]) => {
    options?.onPlacesUpdated?.(enriched);
    options?.onAiReady?.(enriched);
  };

  const runBackgroundAi = async () => {
    const missingIds = finalList.map(p => p.id).filter(id => !!id && !cachedAi.has(id));
    if (missingIds.length === 0) {
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: 1 });
      return;
    }
    onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
    console.log(`[Orchestrator] Generating AI overviews for ${missingIds.length} uncached places...`);
    try {
      const generated = await invokeGenerateAiOverviewsForPlaces(seeds, missingIds);
      if (jobSeq !== latestJobSeq) return;
      for (const [k, v] of generated) cachedAi.set(k, v);
      if (generated.size > 0) {
        triggerUpdates(mergeAiOverviewsOntoPlaces(finalList, cachedAi));
      }
    } catch (err) {
      console.warn('[Orchestrator] Background AI overview generation failed:', err);
    } finally {
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: 1 });
    }
  };

  if (options?.waitForAi) {
    const missingIds = finalList.map(p => p.id).filter(id => !!id && !cachedAi.has(id));
    if (missingIds.length > 0) {
      onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
      const generated = await invokeGenerateAiOverviewsForPlaces(seeds, missingIds);
      for (const [k, v] of generated) cachedAi.set(k, v);
    }
    const enriched = mergeAiOverviewsOntoPlaces(finalList, cachedAi);
    onProgress?.({ stage: 'done', progress: 1 });
    void runBackgroundAi();
    return enriched;
  }

  void runBackgroundAi();
  return baseList;
}

export const getNearbyRestaurants = (
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onProgress?: (update: RestaurantLoadProgress) => void,
  options?: GetNearbyRestaurantsOptions
): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const task: QueuedTask = {
      userLat, userLng, radiusMeters, onProgress, options, resolve, reject,
    };

    if (fetchActive) {
      if (fetchPending) {
        fetchPending.reject(new RestaurantLoadSupersededError());
      }
      fetchPending = task;
      return;
    }

    fetchActive = true;
    void (async () => {
      let current: QueuedTask | null = task;
      while (current) {
        try {
          const result = await loadNearbyRestaurantsInternal(
            current.userLat,
            current.userLng,
            current.radiusMeters,
            current.onProgress,
            current.options,
          );
          current.resolve(result);
        } catch (e) {
          current.reject(e);
        }
        current = fetchPending;
        fetchPending = null;
      }
      fetchActive = false;
    })();
  });
};
