import { getSearchCells, getCellCenter, getCellCentersMap } from './h3Utils';
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
import {
  placesWithinRadius,
  selectSpreadPlaces,
} from './restaurantSpreadSelection';

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

  const cellIds = getSearchCells(userLat, userLng, safeRadius);
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

  console.log(`[Orchestrator] Starting restaurant load: ${cellIds.length} res-7 cells`);

  onProgress?.({ stage: 'reading-cache', progress: 0.2 });
  const { hits: rawHits, misses: uncachedCells } = await readCacheBulk(cellIds);

  console.log(`[Orchestrator] Cell cache check: ${rawHits.size}/${cellIds.length} cells hit, ${uncachedCells.length} cells missing`);

  let allPlaces: Array<CachedPlace & { sourceCellId?: string }> = [];
  rawHits.forEach((places, cellId) => {
    for (const place of places) {
      allPlaces.push({ ...place, sourceCellId: cellId });
    }
  });

  if (uncachedCells.length > 0) {
    onProgress?.({ stage: 'fetching-restaurants', progress: 0.45 });

    const cellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    console.log(`[Orchestrator] Invoking v2-fetch-restaurants for ${cellsPayload.length} uncached cells...`);

    const { data, error } = await invokeFetchRestaurants({ cells: cellsPayload });

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
        for (const place of result.places) {
          allPlaces.push({ ...place, sourceCellId: result.cellId });
        }
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
  const cellCenters = getCellCentersMap(cellIds);
  const withinRadius = placesWithinRadius(allPlaces, userLat, userLng, safeRadius, cellIds);
  const visibleList = selectSpreadPlaces(
    withinRadius,
    cellIds,
    cellCenters,
    SEARCH_CONFIG.MAX_DISPLAY_RESULTS
  );
  console.log(
    `[Orchestrator] Cells [${cellIds.join(', ')}] within ${safeRadius}m: ${withinRadius.length} eligible, showing ${visibleList.length}`
  );

  const seeds = visibleList.map(toPlaceSeed);
  const cachedAi = await getCachedAiOverviewsForPlaces(seeds);
  const baseList = mergeAiOverviewsOntoPlaces(visibleList, cachedAi);
  console.log(`[Orchestrator] AI overview cache: ${cachedAi.size}/${visibleList.length} already enriched`);

  const triggerUpdates = (enriched: any[]) => {
    options?.onPlacesUpdated?.(enriched);
    options?.onAiReady?.(enriched);
  };

  const runBackgroundAi = async () => {
    const missingIds = visibleList.map(p => p.id).filter(id => !!id && !cachedAi.has(id));
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
        triggerUpdates(mergeAiOverviewsOntoPlaces(visibleList, cachedAi));
      }
    } catch (err) {
      console.warn('[Orchestrator] Background AI overview generation failed:', err);
    } finally {
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: 1 });
    }
  };

  if (options?.waitForAi) {
    const missingIds = visibleList.map(p => p.id).filter(id => !!id && !cachedAi.has(id));
    if (missingIds.length > 0) {
      onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
      const generated = await invokeGenerateAiOverviewsForPlaces(seeds, missingIds);
      for (const [k, v] of generated) cachedAi.set(k, v);
    }
    const enriched = mergeAiOverviewsOntoPlaces(visibleList, cachedAi);
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
