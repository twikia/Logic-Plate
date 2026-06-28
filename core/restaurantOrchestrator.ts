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
  onPlacesUpdated?: (places: any[]) => void;
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

const formatAndSortPlaces = (rawPlaces: any[], userLat: number, userLng: number, safeRadius: number) => {
  const uniqueRestaurantsMap = new Map<string, any>();
  for (const place of rawPlaces) {
    if (place.id && !uniqueRestaurantsMap.has(place.id)) {
      uniqueRestaurantsMap.set(place.id, place);
    }
  }
  return Array.from(uniqueRestaurantsMap.values())
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
};

// ── Edge function call helper ─────────────────────────────────────────────────

type FetchRestaurantsPayload = {
  cells: Array<{ cellId: string; lat?: number; lng?: number }>;
  resolution: number;
};

type FetchRestaurantsResponse = {
  newlyFetchedRestaurants: { cellId: string; places: any[] }[];
  failedCells?: string[];
  totalPlacesReturned: number;
};

async function invokeFetchRestaurants(
  payload: FetchRestaurantsPayload
): Promise<{ data: FetchRestaurantsResponse | null; error: any }> {
  try {
    const result = await supabase.functions.invoke('fetch-restaurants', {
      body: payload,
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });
    return { data: result.data as FetchRestaurantsResponse | null, error: result.error };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── Core load function ────────────────────────────────────────────────────────

async function loadNearbyRestaurantsInternal(
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onProgress?: (update: RestaurantLoadProgress) => void,
  options?: GetNearbyRestaurantsOptions
): Promise<any[]> {
  const jobSeq = ++latestRestaurantJobSeq;
  const safeRadius = Math.min(radiusMeters, SEARCH_CONFIG.MAX_RADIUS_METERS);

  // Get up to 7 cells (kRing 1) at resolution 8, 7, or 6 based on 80% coverage rule
  const { cellIds, resolution } = getCellsInRadiusDynamic(userLat, userLng, safeRadius);
  if (cellIds.length === 0) {
    throw new Error('No search cells generated for current location.');
  }

  // ── Cache check (L1 AsyncStorage + L2 Supabase) ────────────────────────────
  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits: rawHits, misses: uncachedCells } = await readCacheBulk(cellIds, resolution);

  console.log(
    `Restaurant cache check complete: ${rawHits.size}/${cellIds.length} cells found in cache (local+db), ${uncachedCells.length} cells still missing.`
  );

  let allRestaurants: any[] = [];
  rawHits.forEach(restaurants => {
    allRestaurants = allRestaurants.concat(restaurants);
  });

  // ── Child cache join ───────────────────────────────────────────────────────
  // For uncached cells, check if any immediate child cells are already cached.
  // Never make API calls for children — only join existing cached items.
  if (resolution < 8 && uncachedCells.length > 0) {
    const childRes = resolution === 7 ? 8 : 7;
    const childCellIds: string[] = [];
    for (const id of uncachedCells) {
      childCellIds.push(...getChildCells(id, childRes));
    }
    const { hits: childHits } = await readCacheBulk(childCellIds, childRes);
    childHits.forEach(restaurants => {
      allRestaurants = allRestaurants.concat(restaurants);
    });
    console.log(`Merged child (res ${childRes}) cache data: found ${childHits.size} child cells cached.`);
  }

  // ── Synchronous fetch of all uncached cells (up to 7 cells max, no paging) ─
  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });

    const cellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(
      `[Search] Fetching ${cellsPayload.length} cells at resolution ${resolution} without paging.`
    );

    const { data, error } = await invokeFetchRestaurants({
      cells: cellsPayload,
      resolution,
    });

    if (error) {
      logEdgeFunctionFailure('fetch-restaurants', { data, error });
      if (allRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, error);
      }
    } else if (data && Array.isArray(data.newlyFetchedRestaurants)) {
      const returnedCount = data.totalPlacesReturned ??
        data.newlyFetchedRestaurants.reduce((sum, r) => sum + (r.places?.length || 0), 0);
      console.log(
        `[Search Complete] Returned ${returnedCount} restaurants across ${data.newlyFetchedRestaurants.length} cells.`
      );

      if (Array.isArray(data.failedCells) && data.failedCells.length > 0) {
        console.warn('[restaurants] Edge function reported failed cells:', data.failedCells);
      }

      for (const result of data.newlyFetchedRestaurants) {
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

  if (allRestaurants.length === 0) {
    throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, 'no restaurant data available');
  }

  onProgress?.({ stage: 'parsing-restaurants', progress: 0.75 });
  const finalList = formatAndSortPlaces(allRestaurants, userLat, userLng, safeRadius);
  const cachedAi = await getCachedAiOverviewsForPlaces(finalList);
  const baseList = mergeAiOntoPlaces(finalList, cachedAi);

  const triggerUpdates = (placesWithAi: any[]) => {
    options?.onPlacesUpdated?.(placesWithAi);
    options?.onAiReady?.(placesWithAi);
  };

  const runBackgroundAiEnrichment = async () => {
    const missingAiIds = finalList.map(p => p.id).filter((id: string) => !!id && !cachedAi.has(id));
    if (missingAiIds.length === 0) {
      if (jobSeq === latestRestaurantJobSeq) {
        onProgress?.({ stage: 'done', progress: 1 });
      }
      return;
    }
    onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
    try {
      const generated = await invokeGenerateAiOverviewsForPlaces(finalList, missingAiIds);
      if (jobSeq !== latestRestaurantJobSeq) return;
      for (const [k, v] of generated) {
        cachedAi.set(k, v);
      }
      if (generated.size > 0) {
        triggerUpdates(mergeAiOntoPlaces(finalList, cachedAi));
      }
    } catch (err) {
      console.warn('Background AI overviews failed:', err);
    } finally {
      if (jobSeq === latestRestaurantJobSeq) {
        onProgress?.({ stage: 'done', progress: 1 });
      }
    }
  };

  if (options?.waitForAi) {
    const missingAiIds = finalList.map(p => p.id).filter((id: string) => !!id && !cachedAi.has(id));
    if (missingAiIds.length > 0) {
      onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
      const generated = await invokeGenerateAiOverviewsForPlaces(finalList, missingAiIds);
      for (const [k, v] of generated) {
        cachedAi.set(k, v);
      }
    }
    const enriched = mergeAiOntoPlaces(finalList, cachedAi);
    onProgress?.({ stage: 'done', progress: 1 });
    void runBackgroundAiEnrichment();
    return enriched;
  }

  void runBackgroundAiEnrichment();
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
