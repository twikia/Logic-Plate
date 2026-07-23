import { getSearchCells, getCellCenter, getCellCentersMap } from './h3Utils';
import { SEARCH_CONFIG } from './searchConfig';
import { readCacheBulk, writeCache, type CachedPlace } from './cacheManager';
import { supabase } from './supabaseClient';
import { logEdgeFunctionFailureAsync } from './supabaseFunctionErrors';
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
  constructor(
    message = RESTAURANT_FETCH_USER_MESSAGE,
    readonly cause?: unknown,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export const logRestaurantFetchError = (e: RestaurantFetchError): void => {
  console.warn('[restaurants]', e.message, e.detail ?? e.cause);
};

export const isRestaurantLoadSupersededError = (e: unknown): boolean =>
  e instanceof RestaurantLoadSupersededError;

export const isRestaurantFetchError = (e: unknown): e is RestaurantFetchError =>
  e instanceof RestaurantFetchError;

export type GetNearbyRestaurantsOptions = {
  onAiReady?: (places: any[]) => void;
  onPlacesUpdated?: (places: any[]) => void;
  waitForAi?: boolean;
  /** Skip background AI (map loads markers first; AI is fetched on marker press). */
  deferAi?: boolean;
  /** Cap eager AI generation to this many closest places. Defaults to MAX_AI_OVERVIEWS. */
  aiLimit?: number;
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
  totalPlacesReturned?: number;
  error?: string;
  code?: string;
  statusCode?: number;
};

function formatFetchResponseDetail(
  data: FetchRestaurantsResponse | null,
  context?: string,
): string {
  const parts: string[] = [];
  if (context) parts.push(context);
  if (data?.statusCode != null) parts.push(`HTTP ${data.statusCode}`);
  if (data?.code) parts.push(data.code);
  if (data?.error) parts.push(data.error);
  if (data?.totalPlacesReturned != null) parts.push(`totalPlacesReturned=${data.totalPlacesReturned}`);
  if (Array.isArray(data?.failedCells) && data.failedCells.length > 0) {
    parts.push(`failedCells=${JSON.stringify(data.failedCells)}`);
  }
  return parts.join(' — ');
}

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
  region: place.region,
  postcode: place.postcode,
  country: place.country,
  category: place.category,
  location: place.location,
  phone: place.phone,
  price_tier: place.priceTier ?? null,
  operating_status: place.operating_status ?? null,
  regular_opening_hours: place.regularOpeningHours ?? null,
  attributes: place.attributes ?? null,
});

function pickClosestPlaces<T extends { id?: string; distanceMeters?: number }>(
  places: T[],
  limit: number,
): T[] {
  return [...places]
    .filter((p) => !!p?.id)
    .sort((a, b) => (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY))
    .slice(0, Math.max(0, limit));
}

async function generateAiInBatches(
  seeds: PlaceSeed[],
  missingIds: string[],
  onBatch?: (generatedSoFar: Map<string, import('./aiOverviewCache').AiOverview>) => void,
): Promise<Map<string, import('./aiOverviewCache').AiOverview>> {
  const all = new Map<string, import('./aiOverviewCache').AiOverview>();
  const batchSize = SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const chunk = missingIds.slice(i, i + batchSize);
    const generated = await invokeGenerateAiOverviewsForPlaces(seeds, chunk);
    for (const [k, v] of generated) all.set(k, v);
    onBatch?.(all);
  }
  return all;
}

const mapAiInflight = new Map<string, Promise<Map<string, import('./aiOverviewCache').AiOverview>>>();

/**
 * On map marker press: generate AI for the clicked place plus nearby missing
 * places to fill one Gemini batch (AI_GENERATION_BATCH_SIZE).
 * Returns the merged candidate list with any newly generated overviews applied.
 */
export async function ensureAiOverviewsAroundPlace<T extends {
  id?: string;
  name?: string;
  aiOverview?: unknown;
  location?: { latitude?: number; longitude?: number } | null;
  distanceMeters?: number;
  website_url?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  category?: string | null;
  phone?: string | null;
  priceTier?: number | null;
  operating_status?: string | null;
  regularOpeningHours?: { weekdayDescriptions: string[] } | null;
  attributes?: string[] | null;
}>(
  target: T,
  candidates: T[],
): Promise<T[]> {
  const targetId = target?.id;
  if (!targetId) return candidates;

  const pool = candidates.length > 0 ? candidates : [target];
  const seeds = pool.map((p) => toPlaceSeed(p as CachedPlace)).filter((s) => !!s.id);
  const cachedAi = await getCachedAiOverviewsForPlaces(seeds);

  const tLat = target.location?.latitude;
  const tLng = target.location?.longitude;
  const distToTarget = (p: T): number => {
    if (p.id === targetId) return -1;
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (
      typeof tLat !== 'number' ||
      typeof tLng !== 'number' ||
      typeof lat !== 'number' ||
      typeof lng !== 'number'
    ) {
      return p.distanceMeters ?? Number.POSITIVE_INFINITY;
    }
    const dLat = ((lat - tLat) * Math.PI) / 180;
    const dLon = ((lng - tLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((tLat * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const missingSorted = pool
    .filter((p) => !!p?.id && !cachedAi.has(p.id!))
    .sort((a, b) => distToTarget(a) - distToTarget(b))
    .slice(0, SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE);

  if (missingSorted.length === 0) {
    return mergeAiOverviewsOntoPlaces(pool, cachedAi);
  }

  const inflightKey = missingSorted.map((p) => p.id).sort().join(',');
  let pending = mapAiInflight.get(inflightKey);
  if (!pending) {
    const missingIds = missingSorted.map((p) => p.id!);
    const batchSeeds = missingSorted.map((p) => toPlaceSeed(p as CachedPlace));
    pending = invokeGenerateAiOverviewsForPlaces(batchSeeds, missingIds).finally(() => {
      mapAiInflight.delete(inflightKey);
    });
    mapAiInflight.set(inflightKey, pending);
  }

  try {
    const generated = await pending;
    for (const [k, v] of generated) cachedAi.set(k, v);
  } catch (err) {
    console.warn('[Orchestrator] Map on-demand AI batch failed:', err);
  }

  return mergeAiOverviewsOntoPlaces(pool, cachedAi);
}

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
      const detail = await logEdgeFunctionFailureAsync('v2-fetch-restaurants', { data, error });
      if (allPlaces.length === 0) {
        throw new RestaurantFetchError(undefined, error, detail);
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
        const detail = formatFetchResponseDetail(data, 'v2-fetch-restaurants returned zero places');
        console.warn(`[Orchestrator] ${detail}`);
        throw new RestaurantFetchError(undefined, detail, detail);
      }
    } else if (allPlaces.length === 0) {
      const detail = formatFetchResponseDetail(data, 'v2-fetch-restaurants returned no data');
      console.warn(`[Orchestrator] ${detail}`);
      throw new RestaurantFetchError(undefined, detail, detail);
    }
  }

  if (allPlaces.length === 0) {
    throw new RestaurantFetchError(undefined, 'no restaurant data available');
  }

  onProgress?.({ stage: 'parsing-restaurants', progress: 0.75 });
  const cellCenters = getCellCentersMap(cellIds);
  const withinRadius = placesWithinRadius(allPlaces, userLat, userLng, safeRadius, cellIds);
  const aiCachePromise = getCachedAiOverviewsForPlaces(withinRadius.map(toPlaceSeed));
  const visibleList = selectSpreadPlaces(
    withinRadius,
    cellIds,
    cellCenters,
    SEARCH_CONFIG.MAX_DISPLAY_RESULTS
  );
  const cachedAi = await aiCachePromise;
  console.log(
    `[Orchestrator] Cells [${cellIds.join(', ')}] within ${safeRadius}m: ${withinRadius.length} eligible, showing ${visibleList.length}`
  );
  const seeds = visibleList.map(toPlaceSeed);
  const baseList = mergeAiOverviewsOntoPlaces(visibleList, cachedAi);
  console.log(`[Orchestrator] AI overview cache: ${cachedAi.size}/${visibleList.length} already enriched`);

  const triggerUpdates = (enriched: any[]) => {
    options?.onPlacesUpdated?.(enriched);
    options?.onAiReady?.(enriched);
  };

  const aiLimit = options?.aiLimit ?? SEARCH_CONFIG.MAX_AI_OVERVIEWS;
  const aiTargets = pickClosestPlaces(visibleList, aiLimit);
  const aiTargetIds = new Set(aiTargets.map((p) => p.id).filter(Boolean));
  const missingAiIds = aiTargets.map((p) => p.id).filter((id) => !!id && !cachedAi.has(id));

  const runBackgroundAi = async () => {
    if (missingAiIds.length === 0) {
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: 1 });
      return;
    }
    onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
    console.log(
      `[Orchestrator] Generating AI overviews for ${missingAiIds.length}/${aiTargets.length} closest places (cap ${aiLimit}) in batches of ${SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE}...`
    );
    try {
      await generateAiInBatches(seeds.filter((s) => aiTargetIds.has(s.id)), missingAiIds, (generated) => {
        if (jobSeq !== latestJobSeq) return;
        for (const [k, v] of generated) cachedAi.set(k, v);
        triggerUpdates(mergeAiOverviewsOntoPlaces(visibleList, cachedAi));
      });
    } catch (err) {
      console.warn('[Orchestrator] Background AI overview generation failed:', err);
    } finally {
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: 1 });
    }
  };

  if (options?.deferAi) {
    onProgress?.({ stage: 'done', progress: 1 });
    return baseList;
  }

  if (options?.waitForAi) {
    if (missingAiIds.length > 0) {
      onProgress?.({ stage: 'loading-overviews', progress: 0.9 });
      await generateAiInBatches(seeds.filter((s) => aiTargetIds.has(s.id)), missingAiIds, (generated) => {
        for (const [k, v] of generated) cachedAi.set(k, v);
        triggerUpdates(mergeAiOverviewsOntoPlaces(visibleList, cachedAi));
      });
    }
    const enriched = mergeAiOverviewsOntoPlaces(visibleList, cachedAi);
    onProgress?.({ stage: 'done', progress: 1 });
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
