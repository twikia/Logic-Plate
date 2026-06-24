import { getCellsInRadiusDynamic, getCellCenter, getChildCells } from './h3Utils';
import { SEARCH_CONFIG } from './searchConfig';
import { readCacheBulk, writeCache } from './cacheManager';
import { supabase } from './supabaseClient';
import { logEdgeFunctionFailure } from './supabaseFunctionErrors';
import {
  getCachedAiOverviewsForPlaces,
  invokeGenerateAiOverviewsForPlaces,
  mergeAiOverviewsOntoPlaces,
  type AiOverview,
} from './aiOverviewCache';

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  constructor() {
    super('Restaurant load superseded');
  }
}

export const RESTAURANT_FETCH_USER_MESSAGE =
  "Couldn't load nearby restaurants. Check your connection and try again.";

export class RestaurantFetchError extends Error {
  readonly name = 'RestaurantFetchError';
  constructor(message: string = RESTAURANT_FETCH_USER_MESSAGE, readonly cause?: unknown) {
    super(message);
  }
}

export const isRestaurantLoadSupersededError = (e: unknown): boolean =>
  e instanceof RestaurantLoadSupersededError;

export const isRestaurantFetchError = (e: unknown): e is RestaurantFetchError =>
  e instanceof RestaurantFetchError;

export type GetNearbyRestaurantsOptions = {
  onAiReady?: (places: any[]) => void;
  waitForAi?: boolean;
};

let latestRestaurantJobSeq = 0;

type QueuedRestaurantTask = {
  userLat: number;
  userLng: number;
  radiusMeters: number;
  onProgress?: (update: RestaurantLoadProgress) => void;
  options?: GetNearbyRestaurantsOptions;
  resolve: (places: any[]) => void;
  reject: (e: unknown) => void;
};

let restaurantFetchActive = false;
let restaurantFetchPending: QueuedRestaurantTask | null = null;

const mergeAiOntoPlaces = (finalList: any[], aiById: Map<string, AiOverview>) =>
  mergeAiOverviewsOntoPlaces(finalList, aiById);

async function loadNearbyRestaurantsInternal(
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onProgress?: (update: RestaurantLoadProgress) => void,
  options?: GetNearbyRestaurantsOptions
): Promise<any[]> {
  const jobSeq = ++latestRestaurantJobSeq;
  const safeRadius = Math.min(radiusMeters, SEARCH_CONFIG.MAX_RADIUS_METERS);
  const apiCallCap = safeRadius <= SEARCH_CONFIG.SMALL_RADIUS_METERS
    ? SEARCH_CONFIG.SMALL_RADIUS_API_CAP
    : SEARCH_CONFIG.LARGE_RADIUS_API_CAP;

  const { cellIds, resolution } = getCellsInRadiusDynamic(userLat, userLng, safeRadius);
  if (cellIds.length === 0) {
    throw new Error('No search cells generated for current location.');
  }

  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits, misses: uncachedCells } = await readCacheBulk(cellIds, resolution);
  console.log(
    `Restaurant cache check complete: ${hits.size}/${cellIds.length} cells found in cache (local+db), ${uncachedCells.length} cells still missing.`
  );

  let allRestaurants: any[] = [];
  hits.forEach(restaurants => {
    allRestaurants = allRestaurants.concat(restaurants);
  });

  if (resolution < 8) {
    const childCellIds: string[] = [];
    for (const id of cellIds) {
      childCellIds.push(...getChildCells(id, 8));
    }
    const { hits: childHits } = await readCacheBulk(childCellIds, 8);
    childHits.forEach(restaurants => {
      allRestaurants = allRestaurants.concat(restaurants);
    });
    console.log(`Merged child (res 8) cache data: found ${childHits.size} child cells cached.`);
  }

  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });
    const cellsToFetch = uncachedCells.slice(0, apiCallCap);
    const missingCellsPayload = cellsToFetch.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(
      `Database cache misses remain for ${uncachedCells.length} cells. Sending ${cellsToFetch.length} (cap: ${apiCallCap}) to fetch-missing-cells...`
    );

    let data: unknown;
    let error: { message?: string; name?: string; context?: unknown } | null = null;
    try {
      const functionName = resolution === 8 ? 'fetch-missing-cells' : 'fetch-missing-cells-macro';
      const body = resolution === 8 
        ? { missingCells: missingCellsPayload } 
        : { missingCells: missingCellsPayload, resolution };

      const invokeResult = await supabase.functions.invoke(functionName, {
        body,
        headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
      });
      data = invokeResult.data;
      error = invokeResult.error;
    } catch (err) {
      logEdgeFunctionFailure(resolution === 8 ? 'fetch-missing-cells' : 'fetch-missing-cells-macro', {
        data: null,
        error: err instanceof Error ? { message: err.message, name: err.name } : { message: String(err) },
      });
      if (allRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, err);
      }
      data = null;
      error = null;
    }

    if (error) {
      logEdgeFunctionFailure(resolution === 8 ? 'fetch-missing-cells' : 'fetch-missing-cells-macro', { data, error });
      if (allRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, error);
      }
    } else if (data && Array.isArray((data as { newlyFetchedRestaurants?: unknown }).newlyFetchedRestaurants)) {
      const payload = data as {
        newlyFetchedRestaurants: { cellId: string; places: any[] }[];
        failedCells?: string[];
      };
      console.log(`Edge function returned data for ${payload.newlyFetchedRestaurants.length} cells.`);
      if (Array.isArray(payload.failedCells) && payload.failedCells.length > 0) {
        console.warn('[restaurants] Edge function reported failed cells:', payload.failedCells);
      }
      for (const result of payload.newlyFetchedRestaurants) {
        await writeCache(result.cellId, result.places);
        allRestaurants = allRestaurants.concat(result.places);
      }
      if (allRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, 'edge function returned zero restaurants');
      }
    } else if (allRestaurants.length === 0) {
      throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, 'edge function returned no data');
    }
  }

  onProgress?.({ stage: 'parsing-restaurants', progress: 0.75 });
  const uniqueRestaurantsMap = new Map<string, any>();
  for (const place of allRestaurants) {
    if (place.id && !uniqueRestaurantsMap.has(place.id)) {
      uniqueRestaurantsMap.set(place.id, place);
    }
  }

  const finalList = Array.from(uniqueRestaurantsMap.values())
    .map(place => {
      if (!place.location?.latitude || !place.location?.longitude) {
        return { ...place, distanceMeters: Infinity };
      }
      return {
        ...place,
        distanceMeters: haversineDistance(
          userLat,
          userLng,
          place.location.latitude,
          place.location.longitude
        ),
      };
    })
    .filter(place => place.distanceMeters <= safeRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const cachedAi = await getCachedAiOverviewsForPlaces(finalList);
  const baseList = mergeAiOntoPlaces(finalList, cachedAi);

  const missingIds = finalList.map(p => p.id).filter((id: string) => !!id && !cachedAi.has(id));

  const runAiMerge = async () => {
    if (missingIds.length === 0) {
      onProgress?.({ stage: 'done', progress: 1 });
      return;
    }
    onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
    try {
      const generated = await invokeGenerateAiOverviewsForPlaces(finalList, missingIds);
      if (jobSeq !== latestRestaurantJobSeq) return;
      for (const [k, v] of generated) {
        cachedAi.set(k, v);
      }
      if (generated.size > 0) {
        const enriched = mergeAiOntoPlaces(finalList, cachedAi);
        options?.onAiReady?.(enriched);
      }
    } catch (err) {
      console.error('Background AI overviews failed:', err);
    } finally {
      if (jobSeq === latestRestaurantJobSeq) {
        onProgress?.({ stage: 'done', progress: 1 });
      }
    }
  };

  if (missingIds.length > 0) {
    if (options?.waitForAi) {
      onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
      const generated = await invokeGenerateAiOverviewsForPlaces(finalList, missingIds);
      for (const [k, v] of generated) {
        cachedAi.set(k, v);
      }
      const enriched = mergeAiOntoPlaces(finalList, cachedAi);
      onProgress?.({ stage: 'done', progress: 1 });
      return enriched;
    }
    void runAiMerge();
  } else {
    onProgress?.({ stage: 'done', progress: 1 });
  }

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
    const task: QueuedRestaurantTask = {
      userLat,
      userLng,
      radiusMeters,
      onProgress,
      options,
      resolve,
      reject,
    };

    if (restaurantFetchActive) {
      if (restaurantFetchPending) {
        restaurantFetchPending.reject(new RestaurantLoadSupersededError());
      }
      restaurantFetchPending = task;
      return;
    }

    restaurantFetchActive = true;
    void (async () => {
      let current: QueuedRestaurantTask | null = task;
      while (current) {
        try {
          const result = await loadNearbyRestaurantsInternal(
            current.userLat,
            current.userLng,
            current.radiusMeters,
            current.onProgress,
            current.options
          );
          current.resolve(result);
        } catch (e) {
          current.reject(e);
        }
        current = restaurantFetchPending;
        restaurantFetchPending = null;
      }
      restaurantFetchActive = false;
    })();
  });
};
