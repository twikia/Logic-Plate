import {
    getCachedAiOverviewsForPlaces,
    invokeGenerateAiOverviewsForPlaces,
    mergeAiOverviewsOntoPlaces,
    type PlaceSeed,
} from './aiOverviewCache';
import { readCacheBulk, writeCache, type CachedPlace } from './cacheManager';
import { checkIsPopulatedArea } from './geoRestriction';
import { getCellCenter, getCellCentersMap, getRes7CellId, getSearchCells } from './h3Utils';
import { enrichPlacesWithScrapeHours } from './hoursEnrichment';
import { filterUsablePlaces } from './placeQuality';
import { loadRejectedPlaceIds, markRejectedPlaceIds } from './rejectedPlaces';
import {
    placesWithinRadius,
    selectSpreadPlaces,
} from './restaurantSpreadSelection';
import { SEARCH_CONFIG } from './searchConfig';
import { logAppIssue } from './issueLog';
import { supabase } from './supabaseClient';
import { logEdgeFunctionFailureAsync } from './supabaseFunctionErrors';
import { ensureWebsiteScrapes, findMissingScrapeIds, streamWebsiteScrapesForAi } from './websiteScrapeCache';

export type RestaurantLoadStage =
  | 'reading-cache'
  | 'fetching-restaurants'
  | 'parsing-restaurants'
  | 'loading-overviews'
  | 'done';

export type RestaurantLoadProgressDetail = {
  done: number;
  total: number;
  unit: 'cells' | 'overviews' | 'restaurants';
};

export type RestaurantLoadProgress = {
  stage: RestaurantLoadStage;
  progress: number;
  detail?: RestaurantLoadProgressDetail;
};

const PROGRESS = {
  cacheStart: 0.05,
  cacheEnd: 0.15,
  fetchStart: 0.15,
  fetchEnd: 0.45,
  parseStart: 0.45,
  parseEnd: 0.55,
  aiStart: 0.55,
  aiEnd: 0.98,
  done: 1,
} as const;

function lerpProgress(start: number, end: number, done: number, total: number): number {
  if (total <= 0) return end;
  const t = Math.min(1, Math.max(0, done / total));
  return start + (end - start) * t;
}

export class RestaurantLoadSupersededError extends Error {
  readonly name = 'RestaurantLoadSupersededError';
  constructor() { super('Restaurant load superseded'); }
}

export const RESTAURANT_FETCH_USER_MESSAGE =
  'Something went wrong, or there are no restaurants in this area.';

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
  logAppIssue({
    kind: 'restaurant_fetch_error',
    message: e.message,
    severity: 'error',
    source: 'client:orchestrator',
    detail: {
      detail: typeof e.detail === 'string' ? e.detail : undefined,
      cause: e.cause instanceof Error ? e.cause.message : e.cause != null ? String(e.cause) : undefined,
    },
  });
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
  /** Cap places returned/shown (home uses aiLimit; map keeps MAX_DISPLAY_RESULTS). */
  displayLimit?: number;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyFetchedCellResults(
  data: FetchRestaurantsResponse | null,
  rejectedIds: Set<string>,
  allPlaces: Array<CachedPlace & { sourceCellId?: string }>,
): Promise<number> {
  if (!data || !Array.isArray(data.newlyFetchedRestaurants)) return 0;
  let added = 0;
  for (const result of data.newlyFetchedRestaurants) {
    const usable = filterUsablePlaces(result.places, rejectedIds);
    await writeCache(result.cellId, usable);
    for (const place of usable) {
      allPlaces.push({ ...place, sourceCellId: result.cellId });
      added += 1;
    }
  }
  return added;
}

async function fetchAndMergeCells(
  cellsPayload: Array<{ cellId: string; lat: number; lng: number }>,
  rejectedIds: Set<string>,
  allPlaces: Array<CachedPlace & { sourceCellId?: string }>,
  onProgress?: (update: RestaurantLoadProgress) => void,
  progress?: { cellsDone: number; totalCells: number },
): Promise<{ data: FetchRestaurantsResponse | null; error: any }> {
  if (cellsPayload.length === 0) {
    return { data: null, error: null };
  }

  console.log(`[Orchestrator] Invoking v2-fetch-restaurants for ${cellsPayload.length} uncached cells...`);
  const { data, error } = await invokeFetchRestaurants({ cells: cellsPayload });

  if (error) {
    return { data, error };
  }

  if (data && Array.isArray(data.newlyFetchedRestaurants)) {
    const returnedCount = data.totalPlacesReturned ??
      data.newlyFetchedRestaurants.reduce((sum, r) => sum + (r.places?.length || 0), 0);
    console.log(
      `[Orchestrator] v2-fetch-restaurants returned ${returnedCount} places across ${data.newlyFetchedRestaurants.length} cells`,
    );

    if (Array.isArray(data.failedCells) && data.failedCells.length > 0) {
      console.warn('[Orchestrator] Edge function reported failed cells:', data.failedCells);
      logAppIssue({
        kind: 'overture_cells_failed',
        message: `${data.failedCells.length} overture cell(s) failed during fetch`,
        severity: 'warn',
        source: 'client:orchestrator',
        detail: { failedCells: data.failedCells },
        cellId: data.failedCells[0]?.cellId ?? null,
      });
    }

    await applyFetchedCellResults(data, rejectedIds, allPlaces);

    if (progress) {
      progress.cellsDone += cellsPayload.length;
      onProgress?.({
        stage: 'fetching-restaurants',
        progress: lerpProgress(
          PROGRESS.fetchStart,
          PROGRESS.fetchEnd,
          progress.cellsDone,
          progress.totalCells,
        ),
        detail: {
          done: allPlaces.length,
          total: Math.max(allPlaces.length, 1),
          unit: 'restaurants',
        },
      });
    }
  }

  return { data, error };
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
  onBatch?: (update: {
    generatedSoFar: Map<string, import('./aiOverviewCache').AiOverview>;
    excludedPlaceIds: string[];
    done: number;
    total: number;
  }) => void | Promise<void>,
): Promise<{
  overviews: Map<string, import('./aiOverviewCache').AiOverview>;
  excludedPlaceIds: string[];
}> {
  const total = missingIds.length;
  const generated = new Map<string, import('./aiOverviewCache').AiOverview>();
  const excludedPlaceIds: string[] = [];
  if (total === 0) return { overviews: generated, excludedPlaceIds };

  const batchSize = SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE;
  const idChunks: string[][] = [];
  for (let i = 0; i < missingIds.length; i += batchSize) {
    idChunks.push(missingIds.slice(i, i + batchSize));
  }

  let finishedCount = 0;
  // Fan out Gemini batches (15 each), capped so we don't overload the edge.
  const maxParallel = SEARCH_CONFIG.AI_GENERATION_MAX_PARALLEL;
  let nextChunk = 0;
  const workers = Array.from({ length: Math.min(maxParallel, idChunks.length) }, async () => {
    while (true) {
      const i = nextChunk++;
      if (i >= idChunks.length) return;
      const chunkIds = idChunks[i];
      try {
        const result = await invokeGenerateAiOverviewsForPlaces(seeds, chunkIds);
        for (const [k, v] of result.overviews) generated.set(k, v);
        excludedPlaceIds.push(...result.excludedPlaceIds);
      } catch (err) {
        console.warn('[Orchestrator] AI batch invoke failed:', err);
      }
      finishedCount += chunkIds.length;
      const done = Math.min(finishedCount, total);
      await onBatch?.({
        generatedSoFar: new Map(generated),
        excludedPlaceIds: [...excludedPlaceIds],
        done,
        total,
      });
    }
  });
  await Promise.all(workers);

  return { overviews: generated, excludedPlaceIds };
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
    await ensureWebsiteScrapes(
      batchSeeds.map((s) => ({ id: s.id, website_url: s.website_url })),
    );
    pending = invokeGenerateAiOverviewsForPlaces(batchSeeds, missingIds)
      .then(async (result) => {
        if (result.excludedPlaceIds.length > 0) {
          await markRejectedPlaceIds(result.excludedPlaceIds);
        }
        return result.overviews;
      })
      .finally(() => {
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

  const rejected = await loadRejectedPlaceIds();
  const merged = mergeAiOverviewsOntoPlaces(pool, cachedAi);
  return filterUsablePlaces(merged, rejected) as T[];
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
    onProgress?.({ stage: 'done', progress: PROGRESS.done });
    return [];
  }

  console.log(`[Orchestrator] Starting restaurant load: ${cellIds.length} res-7 cells`);

  onProgress?.({ stage: 'reading-cache', progress: PROGRESS.cacheStart });
  const rejectedIds = await loadRejectedPlaceIds();
  const { hits: rawHits, misses: uncachedCells } = await readCacheBulk(cellIds);
  onProgress?.({ stage: 'reading-cache', progress: PROGRESS.cacheEnd });

  console.log(`[Orchestrator] Cell cache check: ${rawHits.size}/${cellIds.length} cells hit, ${uncachedCells.length} cells missing`);

  let allPlaces: Array<CachedPlace & { sourceCellId?: string }> = [];
  rawHits.forEach((places, cellId) => {
    for (const place of filterUsablePlaces(places, rejectedIds)) {
      allPlaces.push({ ...place, sourceCellId: cellId });
    }
  });

  const centerCellId = getRes7CellId(userLat, userLng);
  const cellPayloadFor = (cellId: string) => {
    const [lat, lng] = getCellCenter(cellId);
    return { cellId, lat, lng };
  };

  let uncachedPrimary = uncachedCells.filter((id) => id === centerCellId);
  let uncachedSecondary = uncachedCells.filter((id) => id !== centerCellId);
  const fetchProgress = uncachedCells.length > 0
    ? { cellsDone: 0, totalCells: uncachedCells.length }
    : undefined;

  if (uncachedCells.length > 0) {
    onProgress?.({
      stage: 'fetching-restaurants',
      progress: PROGRESS.fetchStart,
      detail: { done: allPlaces.length, total: Math.max(allPlaces.length, 1), unit: 'restaurants' },
    });

    let primaryPayload = uncachedPrimary.map(cellPayloadFor);
    if (primaryPayload.length === 0 && allPlaces.length === 0 && uncachedSecondary.length > 0) {
      primaryPayload = [cellPayloadFor(uncachedSecondary[0])];
      uncachedSecondary = uncachedSecondary.slice(1);
    }

    if (primaryPayload.length > 0) {
      const { data, error } = await fetchAndMergeCells(
        primaryPayload,
        rejectedIds,
        allPlaces,
        onProgress,
        fetchProgress,
      );

      if (error) {
        const detail = await logEdgeFunctionFailureAsync('v2-fetch-restaurants', { data, error });
        if (allPlaces.length === 0) {
          throw new RestaurantFetchError(undefined, error, detail);
        }
      } else if (allPlaces.length === 0) {
        const detail = formatFetchResponseDetail(data, 'v2-fetch-restaurants returned zero places');
        console.warn(`[Orchestrator] ${detail}`);
        logAppIssue({
          kind: 'overture_cell_empty',
          message: 'Key overture cell returned no usable restaurants',
          severity: 'error',
          source: 'client:orchestrator',
          detail: { responseDetail: detail, failedCells: data?.failedCells ?? [] },
          cellId: primaryPayload[0]?.cellId ?? null,
        });
        throw new RestaurantFetchError(undefined, detail, detail);
      }
    } else {
      onProgress?.({
        stage: 'fetching-restaurants',
        progress: PROGRESS.fetchEnd,
        detail: { done: allPlaces.length, total: Math.max(allPlaces.length, 1), unit: 'restaurants' },
      });
    }
  }

  if (allPlaces.length === 0) {
    throw new RestaurantFetchError(undefined, 'no restaurant data available');
  }

  onProgress?.({
    stage: 'parsing-restaurants',
    progress: PROGRESS.parseStart,
    detail: { done: 0, total: Math.max(allPlaces.length, 1), unit: 'restaurants' },
  });
  const cellCenters = getCellCentersMap(cellIds);
  let withinRadius = placesWithinRadius(allPlaces, userLat, userLng, safeRadius, cellIds);
  onProgress?.({
    stage: 'parsing-restaurants',
    progress: lerpProgress(PROGRESS.parseStart, PROGRESS.parseEnd, 1, 2),
    detail: {
      done: Math.min(withinRadius.length, SEARCH_CONFIG.MAX_DISPLAY_RESULTS),
      total: Math.max(withinRadius.length, 1),
      unit: 'restaurants',
    },
  });
  const aiLimit = options?.aiLimit ?? SEARCH_CONFIG.MAX_AI_OVERVIEWS;
  // Home/filter wait for AI on a tight pool; map keeps the full spread set.
  const displayLimit = Math.min(
    SEARCH_CONFIG.MAX_DISPLAY_RESULTS,
    options?.displayLimit ??
      (options?.waitForAi && !options?.deferAi ? aiLimit : SEARCH_CONFIG.MAX_DISPLAY_RESULTS),
  );
  const aiCachePromise = getCachedAiOverviewsForPlaces(withinRadius.map(toPlaceSeed));
  let visibleList = selectSpreadPlaces(
    withinRadius,
    cellIds,
    cellCenters,
    displayLimit
  );
  const cachedAi = await aiCachePromise;
  console.log(
    `[Orchestrator] Cells [${cellIds.join(', ')}] within ${safeRadius}m: ${withinRadius.length} eligible, showing ${visibleList.length}`
  );
  onProgress?.({
    stage: 'parsing-restaurants',
    progress: PROGRESS.parseEnd,
    detail: {
      done: visibleList.length,
      total: Math.max(withinRadius.length, visibleList.length, 1),
      unit: 'restaurants',
    },
  });

  let workingList = [...visibleList];
  workingList = await enrichPlacesWithScrapeHours(workingList);
  let baseList = mergeAiOverviewsOntoPlaces(workingList, cachedAi);
  console.log(`[Orchestrator] AI overview cache: ${cachedAi.size}/${workingList.length} already enriched`);

  const placesForUi = (enriched: any[]) =>
    options?.waitForAi ? enriched.filter((p) => !!p?.aiOverview) : enriched;

  const triggerUpdates = (enriched: any[]) => {
    const ui = placesForUi(enriched);
    options?.onPlacesUpdated?.(ui);
    options?.onAiReady?.(ui);
  };

  const applyExclusions = async (excluded: string[]) => {
    if (excluded.length === 0) return;
    await markRejectedPlaceIds(excluded);
    for (const id of excluded) rejectedIds.add(id);
    workingList = filterUsablePlaces(workingList, rejectedIds);
  };

  const refreshHoursAndEmit = async () => {
    workingList = await enrichPlacesWithScrapeHours(workingList);
    triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
  };

  const refreshDerivedFromAllPlaces = async () => {
    withinRadius = placesWithinRadius(allPlaces, userLat, userLng, safeRadius, cellIds);
    visibleList = selectSpreadPlaces(
      withinRadius,
      cellIds,
      cellCenters,
      displayLimit
    );
    workingList = await enrichPlacesWithScrapeHours([...visibleList]);
    baseList = mergeAiOverviewsOntoPlaces(workingList, cachedAi);
    syncPlaceIndex();
    triggerUpdates(baseList);
  };

  const queueLateCellScrapes = (addedPlaces: Array<CachedPlace & { sourceCellId?: string }>) => {
    const seeds = pickClosestPlaces(addedPlaces, SEARCH_CONFIG.MAX_WEBSITE_SCRAPES)
      .filter((p) => !!p.id && !!p.website_url)
      .map((p) => ({ id: p.id!, website_url: p.website_url }));
    if (seeds.length === 0) return;
    void ensureWebsiteScrapes(seeds, {
      maxParallel: SEARCH_CONFIG.BACKGROUND_SCRAPE_MAX_PARALLEL,
      delayMsBetweenBatches: SEARCH_CONFIG.BACKGROUND_SCRAPE_DELAY_MS,
    }).then(async (excluded) => {
      if (jobSeq !== latestJobSeq) return;
      if (excluded.length > 0) await applyExclusions(excluded);
      await refreshDerivedFromAllPlaces();
    }).catch((err) => {
      console.warn('[Orchestrator] Late-cell scrape warm failed:', err);
    });
  };

  const fetchSecondaryCellsInBackground = () => {
    if (uncachedSecondary.length === 0) return;
    void (async () => {
      console.log(
        `[Orchestrator] Background fetch for ${uncachedSecondary.length} ring cells (center ${centerCellId} already served)`,
      );
      for (const cellId of uncachedSecondary) {
        if (jobSeq !== latestJobSeq) return;
        if (SEARCH_CONFIG.BACKGROUND_CELL_FETCH_DELAY_MS > 0) {
          await sleep(SEARCH_CONFIG.BACKGROUND_CELL_FETCH_DELAY_MS);
        }
        const beforeCount = allPlaces.length;
        try {
          await fetchAndMergeCells(
            [cellPayloadFor(cellId)],
            rejectedIds,
            allPlaces,
            onProgress,
            fetchProgress,
          );
        } catch (err) {
          console.warn(`[Orchestrator] Background cell fetch failed for ${cellId}:`, err);
          continue;
        }
        if (jobSeq !== latestJobSeq) return;
        const addedPlaces = allPlaces.slice(beforeCount);
        if (addedPlaces.length === 0) continue;
        await refreshDerivedFromAllPlaces();
        queueLateCellScrapes(addedPlaces);
      }
    })();
  };

  // Priority scrape+AI: display cards first, then closest fill.
  // Stream AI in parallel batches of 15 as scrapes complete (no wall-clock cutoff).
  const scrapePool = pickClosestPlaces(withinRadius, SEARCH_CONFIG.MAX_WEBSITE_SCRAPES)
    .filter((p) => !!p.id && !!p.website_url)
    .map((p) => ({ id: p.id!, website_url: p.website_url }));
  const displayWithSites = pickClosestPlaces(
    workingList.filter((p) => !!p.id && !!p.website_url),
    Math.max(SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE, aiLimit * 2),
  ).map((p) => ({ id: p.id!, website_url: p.website_url }));
  const displayIds = new Set(displayWithSites.map((p) => p.id));
  const raceQueueSize = Math.max(SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE, aiLimit * 2);
  const raceQueue = [
    ...displayWithSites,
    ...scrapePool.filter((p) => !displayIds.has(p.id)),
  ].slice(0, raceQueueSize);
  const placeById = new Map(
    withinRadius.filter((p) => !!p.id).map((p) => [p.id!, p]),
  );

  const syncPlaceIndex = () => {
    placeById.clear();
    for (const p of withinRadius) {
      if (p.id) placeById.set(p.id, p);
    }
  };

  const warmSlowScrapesInBackground = () => {
    void (async () => {
      try {
        const missing = await findMissingScrapeIds(scrapePool.map((p) => p.id));
        const slowPool = scrapePool.filter((p) => missing.has(p.id));
        if (slowPool.length === 0) return;
        console.log(`[Orchestrator] Slow sequential scrape warm for ${slowPool.length} leftover sites`);
        const excluded = await ensureWebsiteScrapes(slowPool, {
          maxParallel: SEARCH_CONFIG.BACKGROUND_SCRAPE_MAX_PARALLEL,
          delayMsBetweenBatches: SEARCH_CONFIG.BACKGROUND_SCRAPE_DELAY_MS,
        });
        if (jobSeq !== latestJobSeq) return;
        if (excluded.length > 0) await applyExclusions(excluded);
        await refreshHoursAndEmit();
      } catch (err) {
        console.warn('[Orchestrator] Slow scrape warm failed:', err);
      }
    })();
  };

  // Map: show markers immediately. Home/filter (waitForAi): only emit AI-enriched.
  const initialUi = placesForUi(baseList);
  if (!options?.waitForAi || initialUi.length > 0) {
    options?.onPlacesUpdated?.(initialUi);
  }
  fetchSecondaryCellsInBackground();

  const emitAiProgress = (done: number, total: number) => {
    const t = total <= 0 ? 1 : Math.min(1, done / total);
    onProgress?.({
      stage: 'loading-overviews',
      progress: lerpProgress(PROGRESS.aiStart, PROGRESS.aiEnd, t, 1),
      detail: { done, total, unit: 'overviews' },
    });
  };

  const runAiForReadyIds = async (readyIds: string[]) => {
    const missingAiIds = readyIds.filter((id) => !!id && !cachedAi.has(id));
    if (missingAiIds.length === 0) return;
    const aiSeeds = missingAiIds
      .map((id) => placeById.get(id))
      .filter(Boolean)
      .map((p) => toPlaceSeed(p as CachedPlace));
    console.log(
      `[Orchestrator] Streaming AI batch of ${missingAiIds.length} (cap ${aiLimit})`,
    );
    await generateAiInBatches(
      aiSeeds,
      missingAiIds,
      async ({ generatedSoFar, excludedPlaceIds }) => {
        if (jobSeq !== latestJobSeq) return;
        for (const [k, v] of generatedSoFar) cachedAi.set(k, v);
        await applyExclusions(excludedPlaceIds);
        const doneCount = raceQueue.filter((p) => cachedAi.has(p.id)).length;
        emitAiProgress(Math.min(doneCount, aiLimit), aiLimit);
        triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
      },
    );
  };

  const runStreamingScrapeAi = async () => {
    onProgress?.({
      stage: 'loading-overviews',
      progress: PROGRESS.aiStart,
      detail: { done: 0, total: aiLimit, unit: 'overviews' },
    });
    try {
      await streamWebsiteScrapesForAi(raceQueue, {
        queueSize: raceQueueSize,
        targetUsable: aiLimit,
        flushEvery: SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE,
        onExcluded: async (ids) => {
          if (jobSeq !== latestJobSeq) return;
          await applyExclusions(ids);
          workingList = filterUsablePlaces(workingList, rejectedIds);
          triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
        },
        onReadyBatch: async (ids) => {
          if (jobSeq !== latestJobSeq) return;
          // Do not block Gemini on hours DB reads — enrich in parallel.
          void enrichPlacesWithScrapeHours(workingList).then((list) => {
            if (jobSeq !== latestJobSeq) return;
            workingList = list;
            triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
          });
          await runAiForReadyIds(ids);
        },
      });
    } catch (err) {
      console.warn('[Orchestrator] Streaming scrape/AI failed:', err);
    }
  };

  // Map: markers only — scrape slowly in background, never auto-generate AI.
  if (options?.deferAi) {
    warmSlowScrapesInBackground();
    onProgress?.({ stage: 'done', progress: PROGRESS.done });
    return baseList;
  }

  if (options?.waitForAi) {
    await runStreamingScrapeAi();
    warmSlowScrapesInBackground();
    const enriched = placesForUi(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
    onProgress?.({ stage: 'done', progress: PROGRESS.done });
    return enriched;
  }

  void (async () => {
    await runStreamingScrapeAi();
    warmSlowScrapesInBackground();
    if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: PROGRESS.done });
  })();
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
