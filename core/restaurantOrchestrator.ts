import { getCellsInRadiusDynamic, getCellCenter, getChildCells } from './h3Utils';
import { SEARCH_CONFIG } from './searchConfig';
import { readCacheBulk, writeCache, appendToCache } from './cacheManager';
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
  cells: Array<{ cellId: string; lat?: number; lng?: number; pageToken?: string }>;
  resolution: number;
  page: number;
};

type FetchRestaurantsResponse = {
  newlyFetchedRestaurants: { cellId: string; places: any[] }[];
  pageTokens: Record<string, string>; // { cellId: nextPageToken }
  failedCells?: string[];
  page: number;
  totalPlacesReturned: number;
  hasNextPage: boolean;
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

  // Always exactly 3 cells: center + 2 nearest neighbours from kRing(1)
  // Resolution 7 for ≤1.5 miles, resolution 6 for larger areas.
  const { cellIds, resolution } = getCellsInRadiusDynamic(userLat, userLng, safeRadius);
  if (cellIds.length === 0) {
    throw new Error('No search cells generated for current location.');
  }

  // ── Cache check (L1 AsyncStorage + L2 Supabase) ────────────────────────────
  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits: rawHits, misses: rawMisses } = await readCacheBulk(cellIds, resolution);

  const uncachedCells = rawMisses;
  const hits = rawHits;

  console.log(
    `Restaurant cache check complete: ${hits.size}/${cellIds.length} cells found in cache (local+db), ${uncachedCells.length} cells still missing.`
  );

  let parentRestaurants: any[] = [];
  hits.forEach(restaurants => {
    parentRestaurants = parentRestaurants.concat(restaurants);
  });

  // ── Child cache join ───────────────────────────────────────────────────────
  // For uncached res-7 cells, check if any res-8 child cells are already cached.
  // For uncached res-6 cells, check res-7 children.
  // This surfaces previously-fetched data immediately while the API fetch runs.
  let childCachedRestaurants: any[] = [];
  if (resolution < 8 && uncachedCells.length > 0) {
    const childRes = resolution === 7 ? 8 : 7;
    const childCellIds: string[] = [];
    for (const id of uncachedCells) {
      childCellIds.push(...getChildCells(id, childRes));
    }
    const { hits: childHits } = await readCacheBulk(childCellIds, childRes);
    childHits.forEach(restaurants => {
      childCachedRestaurants = childCachedRestaurants.concat(restaurants);
    });
    console.log(`Merged child (res ${childRes}) cache data: found ${childHits.size} child cells cached.`);
  }

  // ── Page 1: synchronous fetch of all uncached cells ───────────────────────
  let page1NewPlacesCount = 0;
  let page1PageTokens: Record<string, string> = {};

  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });

    // Build payload: lat/lng required for fresh page-1 searches
    const cellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    const hasMoreCells = false; // always false: 3 cells always fit in one page
    console.log(
      `[Search Page 1] Fetching ${cellsPayload.length} cells at resolution ${resolution}.`
    );

    const { data, error } = await invokeFetchRestaurants({
      cells: cellsPayload,
      resolution,
      page: 1,
    });

    if (error) {
      logEdgeFunctionFailure('fetch-restaurants', { data, error });
      if (parentRestaurants.length === 0 && childCachedRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, error);
      }
    } else if (data && Array.isArray(data.newlyFetchedRestaurants)) {
      const returnedCount = data.totalPlacesReturned ??
        data.newlyFetchedRestaurants.reduce((sum, r) => sum + (r.places?.length || 0), 0);
      const tokenCount = Object.keys(data.pageTokens ?? {}).length;
      console.log(
        `[Search Page 1 Complete] Returned ${returnedCount} restaurants across ` +
        `${data.newlyFetchedRestaurants.length} cells. Page tokens available: ${tokenCount}.`
      );

      if (Array.isArray(data.failedCells) && data.failedCells.length > 0) {
        console.warn('[restaurants] Edge function reported failed cells:', data.failedCells);
      }

      for (const result of data.newlyFetchedRestaurants) {
        await writeCache(result.cellId, result.places);
        parentRestaurants = parentRestaurants.concat(result.places);
        page1NewPlacesCount += result.places?.length ?? 0;
      }

      page1PageTokens = data.pageTokens ?? {};

      if (parentRestaurants.length === 0 && childCachedRestaurants.length === 0) {
        throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, 'edge function returned zero restaurants');
      }
    } else if (parentRestaurants.length === 0 && childCachedRestaurants.length === 0) {
      throw new RestaurantFetchError(RESTAURANT_FETCH_USER_MESSAGE, 'edge function returned no data');
    }
  }

  // Merge parent results (freshly fetched or cached) with any child-cache bonus data
  let allRestaurants = parentRestaurants.concat(childCachedRestaurants);
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

  // ── Async: pages 2 & 3 + AI enrichment ────────────────────────────────────
  const runAsyncNextPagesAndAi = async () => {
    let currentRestaurants = [...allRestaurants];

    // ── Page 2: follow Google nextPageToken for cells that had more results ──
    // Triggered only if page 1 returned page tokens AND got results.
    const page2CellsWithTokens = Object.entries(page1PageTokens).map(([cellId, pageToken]) => ({
      cellId,
      pageToken,
    }));

    let page2PageTokens: Record<string, string> = {};
    let page2NewPlacesCount = 0;

    if (page2CellsWithTokens.length > 0 && page1NewPlacesCount > 0) {
      console.log(`[Search Page 2] Following page tokens for ${page2CellsWithTokens.length} cells.`);
      try {
        const { data: data2, error: err2 } = await invokeFetchRestaurants({
          cells: page2CellsWithTokens,
          resolution,
          page: 2,
        });

        if (err2) {
          console.warn('[Search Page 2] Error:', err2);
        } else if (data2 && Array.isArray(data2.newlyFetchedRestaurants)) {
          const count2 = data2.totalPlacesReturned ??
            data2.newlyFetchedRestaurants.reduce((sum: number, r: any) => sum + (r.places?.length || 0), 0);
          const token2Count = Object.keys(data2.pageTokens ?? {}).length;
          console.log(
            `[Search Page 2 Complete] Returned ${count2} restaurants. Page tokens for page 3: ${token2Count}.`
          );

          // Cache write always runs regardless of jobSeq — ensures DB/AsyncStorage completeness
          for (const item of data2.newlyFetchedRestaurants) {
            await appendToCache(item.cellId, item.places);
            currentRestaurants = currentRestaurants.concat(item.places);
            page2NewPlacesCount += item.places?.length ?? 0;
          }

          page2PageTokens = data2.pageTokens ?? {};

          // Only update UI if this job is still active
          if (jobSeq === latestRestaurantJobSeq) {
            const sorted2 = formatAndSortPlaces(currentRestaurants, userLat, userLng, safeRadius);
            triggerUpdates(mergeAiOntoPlaces(sorted2, cachedAi));
          }
        }
      } catch (err) {
        console.warn('[Search Page 2] Error:', err);
      }
    }

    // ── Page 3: follow page-2 tokens ────────────────────────────────────────
    const page3CellsWithTokens = Object.entries(page2PageTokens).map(([cellId, pageToken]) => ({
      cellId,
      pageToken,
    }));

    if (page3CellsWithTokens.length > 0 && page2NewPlacesCount > 0) {
      console.log(`[Search Page 3] Following page tokens for ${page3CellsWithTokens.length} cells.`);
      try {
        const { data: data3, error: err3 } = await invokeFetchRestaurants({
          cells: page3CellsWithTokens,
          resolution,
          page: 3,
        });

        if (err3) {
          console.warn('[Search Page 3] Error:', err3);
        } else if (data3 && Array.isArray(data3.newlyFetchedRestaurants)) {
          const count3 = data3.totalPlacesReturned ??
            data3.newlyFetchedRestaurants.reduce((sum: number, r: any) => sum + (r.places?.length || 0), 0);
          console.log(`[Search Page 3 Complete] Returned ${count3} restaurants.`);

          // Cache write always runs regardless of jobSeq
          for (const item of data3.newlyFetchedRestaurants) {
            await appendToCache(item.cellId, item.places);
            currentRestaurants = currentRestaurants.concat(item.places);
          }

          // Only update UI if this job is still active
          if (jobSeq === latestRestaurantJobSeq) {
            const sorted3 = formatAndSortPlaces(currentRestaurants, userLat, userLng, safeRadius);
            triggerUpdates(mergeAiOntoPlaces(sorted3, cachedAi));
          }
        }
      } catch (err) {
        console.warn('[Search Page 3] Error:', err);
      }
    }

    // ── Background AI Overviews Enrichment ────────────────────────────────────
    const finalSorted = formatAndSortPlaces(currentRestaurants, userLat, userLng, safeRadius);
    const missingAiIds = finalSorted.map(p => p.id).filter((id: string) => !!id && !cachedAi.has(id));
    if (missingAiIds.length === 0) {
      if (jobSeq === latestRestaurantJobSeq) {
        onProgress?.({ stage: 'done', progress: 1 });
      }
      return;
    }
    onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
    try {
      const generated = await invokeGenerateAiOverviewsForPlaces(finalSorted, missingAiIds);
      if (jobSeq !== latestRestaurantJobSeq) return;
      for (const [k, v] of generated) {
        cachedAi.set(k, v);
      }
      if (generated.size > 0) {
        triggerUpdates(mergeAiOntoPlaces(finalSorted, cachedAi));
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
    void runAsyncNextPagesAndAi();
    return enriched;
  }

  void runAsyncNextPagesAndAi();
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
