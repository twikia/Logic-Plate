import {
    getCachedAiOverviewsForPlaces,
    invokeGenerateAiOverviewsForPlaces,
    mergeAiOverviewsOntoPlaces,
    type PlaceSeed,
} from './aiOverviewCache';
import { readCacheBulk, writeCache, type CachedPlace } from './cacheManager';
import { checkIsPopulatedArea } from './geoRestriction';
import { getCellCenter, getCellCentersMap, getSearchCells } from './h3Utils';
import { enrichPlacesWithScrapeHours } from './hoursEnrichment';
import { filterUsablePlaces } from './placeQuality';
import { loadRejectedPlaceIds, markRejectedPlaceIds } from './rejectedPlaces';
import {
    placesWithinRadius,
    selectSpreadPlaces,
} from './restaurantSpreadSelection';
import { SEARCH_CONFIG } from './searchConfig';
import { supabase } from './supabaseClient';
import { logEdgeFunctionFailureAsync } from './supabaseFunctionErrors';
import { ensureWebsiteScrapes, raceWebsiteScrapesForAi } from './websiteScrapeCache';

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
  // One edge invoke per Gemini batch of 15 — each returns independently and streams into UI.
  await Promise.all(
    idChunks.map(async (chunkIds) => {
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
    }),
  );

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

  if (uncachedCells.length > 0) {
    const cellsPayload = uncachedCells.map(cellId => {
      const [lat, lng] = getCellCenter(cellId);
      return { cellId, lat, lng };
    });

    onProgress?.({
      stage: 'fetching-restaurants',
      progress: PROGRESS.fetchStart,
      detail: { done: allPlaces.length, total: Math.max(allPlaces.length, 1), unit: 'restaurants' },
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

      let cellsDone = 0;
      for (const result of data.newlyFetchedRestaurants) {
        const usable = filterUsablePlaces(result.places, rejectedIds);
        await writeCache(result.cellId, usable);
        for (const place of usable) {
          allPlaces.push({ ...place, sourceCellId: result.cellId });
        }
        cellsDone += 1;
        onProgress?.({
          stage: 'fetching-restaurants',
          progress: lerpProgress(PROGRESS.fetchStart, PROGRESS.fetchEnd, cellsDone, cellsPayload.length),
          detail: {
            done: allPlaces.length,
            total: Math.max(allPlaces.length, 1),
            unit: 'restaurants',
          },
        });
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
    } else {
      onProgress?.({
        stage: 'fetching-restaurants',
        progress: PROGRESS.fetchEnd,
        detail: { done: cellsPayload.length, total: cellsPayload.length, unit: 'cells' },
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
  const withinRadius = placesWithinRadius(allPlaces, userLat, userLng, safeRadius, cellIds);
  onProgress?.({
    stage: 'parsing-restaurants',
    progress: lerpProgress(PROGRESS.parseStart, PROGRESS.parseEnd, 1, 2),
    detail: {
      done: Math.min(withinRadius.length, SEARCH_CONFIG.MAX_DISPLAY_RESULTS),
      total: Math.max(withinRadius.length, 1),
      unit: 'restaurants',
    },
  });
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
  const baseList = mergeAiOverviewsOntoPlaces(workingList, cachedAi);
  console.log(`[Orchestrator] AI overview cache: ${cachedAi.size}/${workingList.length} already enriched`);

  const triggerUpdates = (enriched: any[]) => {
    options?.onPlacesUpdated?.(enriched);
    options?.onAiReady?.(enriched);
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

  const aiLimit = options?.aiLimit ?? SEARCH_CONFIG.MAX_AI_OVERVIEWS;

  // Priority scrape race: homepage/display cards first, then closest fill → 120.
  // Beyond 120: slower background warm only.
  const scrapePool = pickClosestPlaces(withinRadius, SEARCH_CONFIG.MAX_WEBSITE_SCRAPES)
    .filter((p) => !!p.id && !!p.website_url)
    .map((p) => ({ id: p.id!, website_url: p.website_url }));
  const displayWithSites = pickClosestPlaces(
    workingList.filter((p) => !!p.id && !!p.website_url),
    SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE,
  ).map((p) => ({ id: p.id!, website_url: p.website_url }));
  const displayIds = new Set(displayWithSites.map((p) => p.id));
  const raceQueue = [
    ...displayWithSites,
    ...scrapePool.filter((p) => !displayIds.has(p.id)),
  ].slice(0, SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE);
  const raceIdSet = new Set(raceQueue.map((p) => p.id));
  const restScrapes = scrapePool.filter((p) => !raceIdSet.has(p.id));
  const placeById = new Map(
    withinRadius.filter((p) => !!p.id).map((p) => [p.id!, p]),
  );

  const warmRestScrapesInBackground = () => {
    void ensureWebsiteScrapes(restScrapes, {
      maxParallel: Math.max(2, Math.floor(SEARCH_CONFIG.WEBSITE_SCRAPE_MAX_PARALLEL / 2)),
    }).then(async (excluded) => {
      if (jobSeq !== latestJobSeq) return;
      if (excluded.length > 0) await applyExclusions(excluded);
      await refreshHoursAndEmit();
    });
  };

  type RaceHandle = { readyIds: string[]; remaining: Promise<string[]> };

  const runScrapeRace = async (): Promise<RaceHandle> => {
    onProgress?.({
      stage: 'loading-overviews',
      progress: PROGRESS.aiStart,
      detail: { done: 0, total: aiLimit, unit: 'overviews' },
    });
    const { readyIds, excludedPlaceIds, remaining } = await raceWebsiteScrapesForAi(raceQueue, {
      queueSize: SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE,
      targetUsable: aiLimit,
      timeoutMs: SEARCH_CONFIG.AI_SCRAPE_WAIT_MS,
    });
    if (jobSeq !== latestJobSeq) return { readyIds: [], remaining: Promise.resolve([]) };
    await applyExclusions(excludedPlaceIds);
    workingList = await enrichPlacesWithScrapeHours(workingList);
    triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
    onProgress?.({
      stage: 'loading-overviews',
      progress: lerpProgress(PROGRESS.aiStart, PROGRESS.aiEnd, 0.15, 1),
      detail: { done: 0, total: Math.max(readyIds.length, 1), unit: 'overviews' },
    });
    return { readyIds, remaining };
  };

  // Show restaurants immediately; photos load async via RestaurantImage.
  options?.onPlacesUpdated?.(baseList);

  const emitAiProgress = (done: number, total: number) => {
    const t = total <= 0 ? 1 : 0.15 + 0.85 * Math.min(1, done / total);
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
    emitAiProgress(0, missingAiIds.length);
    console.log(
      `[Orchestrator] Generating AI for ${missingAiIds.length} scrape-ready places ` +
        `(raced ${raceQueue.length}, cap ${aiLimit}) via ` +
        `${Math.ceil(missingAiIds.length / SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE)} parallel edge calls of ${SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE}...`,
    );
    await generateAiInBatches(
      aiSeeds,
      missingAiIds,
      async ({ generatedSoFar, excludedPlaceIds, done, total }) => {
        if (jobSeq !== latestJobSeq) return;
        for (const [k, v] of generatedSoFar) cachedAi.set(k, v);
        await applyExclusions(excludedPlaceIds);
        emitAiProgress(done, total);
        triggerUpdates(mergeAiOverviewsOntoPlaces(workingList, cachedAi));
      },
    );
  };

  /** After the wait budget: finish remaining of the 120, AI up to aiLimit, warm the rest slower. */
  const continueDeferredAi = (alreadyReady: string[], remaining: Promise<string[]>) => {
    void (async () => {
      try {
        const allReady = await remaining;
        if (jobSeq !== latestJobSeq) return;
        await refreshHoursAndEmit();
        const already = new Set(alreadyReady);
        const deferred = allReady.filter((id) => !already.has(id) && !cachedAi.has(id));
        const room = Math.max(0, aiLimit - [...cachedAi.keys()].filter((id) => raceIdSet.has(id)).length);
        const displaySet = new Set(workingList.map((p) => p.id).filter(Boolean) as string[]);
        const prioritized = [
          ...deferred.filter((id) => displaySet.has(id)),
          ...deferred.filter((id) => !displaySet.has(id)),
        ];
        const toAi = prioritized.slice(0, Math.max(room, 0));
        if (toAi.length > 0) {
          console.log(`[Orchestrator] Deferred AI for ${toAi.length} late scrape finishes`);
          await runAiForReadyIds(toAi);
        }
      } catch (err) {
        console.warn('[Orchestrator] Deferred scrape/AI failed:', err);
      } finally {
        warmRestScrapesInBackground();
      }
    })();
  };

  const runBackgroundAi = async () => {
    let readyIds: string[] = [];
    let remaining: Promise<string[]> = Promise.resolve([]);
    try {
      const race = await runScrapeRace();
      readyIds = race.readyIds;
      remaining = race.remaining;
    } catch (err) {
      console.warn('[Orchestrator] Scrape race failed:', err);
      warmRestScrapesInBackground();
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: PROGRESS.done });
      return;
    }
    try {
      await runAiForReadyIds(readyIds);
    } catch (err) {
      console.warn('[Orchestrator] Background AI overview generation failed:', err);
    } finally {
      continueDeferredAi(readyIds, remaining);
      if (jobSeq === latestJobSeq) onProgress?.({ stage: 'done', progress: PROGRESS.done });
    }
  };

  if (options?.deferAi) {
    void runScrapeRace().then((race) => {
      continueDeferredAi(race.readyIds, race.remaining);
    });
    onProgress?.({ stage: 'done', progress: PROGRESS.done });
    return baseList;
  }

  if (options?.waitForAi) {
    let readyIds: string[] = [];
    let remaining: Promise<string[]> = Promise.resolve([]);
    try {
      const race = await runScrapeRace();
      readyIds = race.readyIds;
      remaining = race.remaining;
    } catch (err) {
      console.warn('[Orchestrator] Scrape race failed:', err);
    }
    try {
      await runAiForReadyIds(readyIds);
    } catch (err) {
      console.warn('[Orchestrator] AI overview generation failed:', err);
    }
    continueDeferredAi(readyIds, remaining);
    const enriched = mergeAiOverviewsOntoPlaces(workingList, cachedAi);
    onProgress?.({ stage: 'done', progress: PROGRESS.done });
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
