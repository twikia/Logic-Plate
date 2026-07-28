import { markRejectedPlaceIds } from './rejectedPlaces';
import { SEARCH_CONFIG } from './searchConfig';
import { supabase } from './supabaseClient';

export type ScrapeSeed = {
  id: string;
  website_url?: string | null;
};

const SCRAPE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns gers_ids that still need a scrape (missing or stale cache). */
export async function findMissingScrapeIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const missing = new Set(unique);
  if (unique.length === 0) return missing;

  for (const part of chunk(unique, 200)) {
    const { data, error } = await supabase
      .from('v2_website_scrape_cache')
      .select('gers_id, scraped_at')
      .in('gers_id', part);
    if (error) {
      console.warn('[ScrapeCache] lookup error:', error.message);
      continue;
    }
    const now = Date.now();
    for (const row of data ?? []) {
      const age = now - new Date(row.scraped_at).getTime();
      if (Number.isFinite(age) && age < SCRAPE_TTL_MS) missing.delete(row.gers_id);
    }
  }
  return missing;
}

async function invokeScrapeBatch(
  places: ScrapeSeed[],
): Promise<{ excluded: string[]; scrapedIds: string[] }> {
  const payload = places
    .filter((p) => p.id && p.website_url)
    .map((p) => ({ gers_id: p.id, website_url: p.website_url }));
  if (payload.length === 0) return { excluded: [], scrapedIds: [] };

  const { data, error } = await supabase.functions.invoke('v2-scrape-websites', {
    body: { places: payload },
    headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
  });
  if (error) {
    console.warn('[ScrapeCache] v2-scrape-websites error:', error.message);
    return { excluded: [], scrapedIds: [] };
  }
  const excluded = Array.isArray(data?.excludedPlaceIds)
    ? (data.excludedPlaceIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  if (excluded.length > 0) {
    await markRejectedPlaceIds(excluded);
  }
  const scrapedIds = Array.isArray(data?.scrapedPlaceIds)
    ? (data.scrapedPlaceIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const finishedFallback =
    scrapedIds.length === 0 && !Array.isArray(data?.scrapedPlaceIds)
      ? payload.map((p) => p.gers_id).filter((id) => !excluded.includes(id))
      : scrapedIds;
  return { excluded, scrapedIds: finishedFallback };
}

/**
 * Warm website scrapes for places (batched edge invokes).
 * Closest / priority IDs should be passed first when awaiting a subset.
 */
export async function ensureWebsiteScrapes(
  places: ScrapeSeed[],
  options?: {
    limit?: number;
    awaitBatches?: number;
    maxParallel?: number;
    delayMsBetweenBatches?: number;
  },
): Promise<string[]> {
  const withSites = places.filter((p) => p.id && p.website_url);
  const capped = withSites.slice(0, options?.limit ?? SEARCH_CONFIG.MAX_WEBSITE_SCRAPES);
  if (capped.length === 0) return [];

  const missing = await findMissingScrapeIds(capped.map((p) => p.id));
  const toScrape = capped.filter((p) => missing.has(p.id));
  if (toScrape.length === 0) return [];

  const batches = chunk(toScrape, SEARCH_CONFIG.WEBSITE_SCRAPE_BATCH_SIZE);
  const awaitCount = options?.awaitBatches ?? batches.length;
  const maxParallel = options?.maxParallel ?? SEARCH_CONFIG.WEBSITE_SCRAPE_MAX_PARALLEL;
  const delayMs = options?.delayMsBetweenBatches ?? 0;
  const excludedAll: string[] = [];

  let next = 0;
  const workers = Array.from({ length: Math.min(maxParallel, batches.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= batches.length) return;
      if (delayMs > 0 && i > 0) await sleep(delayMs);
      const run = invokeScrapeBatch(batches[i]);
      if (i < awaitCount) {
        excludedAll.push(...(await run).excluded);
      } else {
        void run.then((r) => {
          if (r.excluded.length) {
            console.log(`[ScrapeCache] background tombstoned ${r.excluded.length}`);
          }
        });
      }
    }
  });
  await Promise.all(workers);
  return excludedAll;
}

/**
 * Scrape priority sites in parallel; call onReadyBatch whenever flushEvery new
 * scrapes are ready (and once more for a leftover partial). Stops requesting
 * new scrapes once targetUsable ready IDs exist. No hard wall-clock cutoff.
 */
export async function streamWebsiteScrapesForAi(
  placesClosestFirst: ScrapeSeed[],
  options?: {
    queueSize?: number;
    targetUsable?: number;
    flushEvery?: number;
    maxParallel?: number;
    onReadyBatch?: (ids: string[]) => void | Promise<void>;
    onExcluded?: (ids: string[]) => void | Promise<void>;
  },
): Promise<{ readyIds: string[]; excludedPlaceIds: string[] }> {
  const queueSize = options?.queueSize ?? SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE;
  const targetUsable = options?.targetUsable ?? SEARCH_CONFIG.MAX_AI_OVERVIEWS;
  const flushEvery = options?.flushEvery ?? SEARCH_CONFIG.AI_GENERATION_BATCH_SIZE;
  const maxParallel = options?.maxParallel ?? SEARCH_CONFIG.WEBSITE_SCRAPE_MAX_PARALLEL;

  const queue = placesClosestFirst
    .filter((p) => p.id && p.website_url)
    .slice(0, queueSize);
  const order = queue.map((p) => p.id);
  if (order.length === 0) return { readyIds: [], excludedPlaceIds: [] };

  const ready = new Set<string>();
  const dead = new Set<string>();
  const excludedAll: string[] = [];
  const flushed = new Set<string>();
  let flushQueue: Promise<void> = Promise.resolve();

  const enqueueFlush = (ids: string[]) => {
    if (ids.length === 0) return;
    flushQueue = flushQueue.then(async () => {
      await options?.onReadyBatch?.(ids);
    });
  };

  const flushReady = (force = false) => {
    const pending = order.filter((id) => ready.has(id) && !flushed.has(id));
    while (pending.length >= flushEvery || (force && pending.length > 0)) {
      const take = pending.splice(0, Math.min(flushEvery, pending.length));
      if (flushed.size >= targetUsable) break;
      const room = targetUsable - flushed.size;
      const batch = take.slice(0, room);
      for (const id of batch) flushed.add(id);
      enqueueFlush(batch);
      if (flushed.size >= targetUsable) break;
    }
  };

  const { data: cachedRows, error: cacheErr } = await supabase
    .from('v2_website_scrape_cache')
    .select('gers_id, is_dead, scraped_at, menu_text, hours_text')
    .in('gers_id', order);
  if (cacheErr) {
    console.warn('[ScrapeCache] stream cache read error:', cacheErr.message);
  } else {
    const now = Date.now();
    for (const row of cachedRows ?? []) {
      const age = now - new Date(row.scraped_at).getTime();
      if (!Number.isFinite(age) || age >= SCRAPE_TTL_MS) continue;
      if (row.is_dead) {
        dead.add(row.gers_id);
        excludedAll.push(row.gers_id);
      } else if (
        (typeof row.menu_text === 'string' && row.menu_text.trim()) ||
        (typeof row.hours_text === 'string' && row.hours_text.trim())
      ) {
        ready.add(row.gers_id);
      }
    }
  }

  flushReady(false);

  const needFetch = queue.filter((p) => !ready.has(p.id) && !dead.has(p.id));
  const batches = chunk(needFetch, SEARCH_CONFIG.WEBSITE_SCRAPE_BATCH_SIZE);

  let cursor = 0;
  const inflight = new Set<Promise<void>>();

  const launchNext = (): void => {
    while (
      cursor < batches.length &&
      inflight.size < maxParallel &&
      flushed.size < targetUsable
    ) {
      const batch = batches[cursor++];
      const p = invokeScrapeBatch(batch)
        .then(async (result) => {
          if (result.excluded.length > 0) {
            for (const id of result.excluded) {
              dead.add(id);
              ready.delete(id);
              excludedAll.push(id);
            }
            await options?.onExcluded?.(result.excluded);
          }
          for (const id of result.scrapedIds) {
            if (!dead.has(id)) ready.add(id);
          }
          flushReady(false);
        })
        .finally(() => {
          inflight.delete(p);
        });
      inflight.add(p);
    }
  };

  launchNext();
  while (inflight.size > 0 || (cursor < batches.length && flushed.size < targetUsable)) {
    launchNext();
    if (inflight.size === 0) break;
    await Promise.race([...inflight, sleep(250)]);
  }

  flushReady(true);
  await flushQueue;

  if (excludedAll.length > 0) {
    await markRejectedPlaceIds([...new Set(excludedAll)]);
  }

  const readyIds = order.filter((id) => ready.has(id)).slice(0, targetUsable);
  console.log(
    `[ScrapeCache] stream: queued=${order.length} ready=${readyIds.length}/${targetUsable} ` +
      `flushed=${flushed.size} dead=${dead.size} parallel<=${maxParallel}`,
  );
  return { readyIds, excludedPlaceIds: [...new Set(excludedAll)] };
}
