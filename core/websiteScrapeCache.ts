import { SEARCH_CONFIG } from './searchConfig';
import { supabase } from './supabaseClient';
import { markRejectedPlaceIds } from './rejectedPlaces';

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
): Promise<{ excluded: string[]; finishedIds: string[] }> {
  const payload = places
    .filter((p) => p.id && p.website_url)
    .map((p) => ({ gers_id: p.id, website_url: p.website_url }));
  if (payload.length === 0) return { excluded: [], finishedIds: [] };

  const { data, error } = await supabase.functions.invoke('v2-scrape-websites', {
    body: { places: payload },
    headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
  });
  if (error) {
    console.warn('[ScrapeCache] v2-scrape-websites error:', error.message);
    return { excluded: [], finishedIds: [] };
  }
  const excluded = Array.isArray(data?.excludedPlaceIds)
    ? (data.excludedPlaceIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  if (excluded.length > 0) {
    await markRejectedPlaceIds(excluded);
  }
  const excludedSet = new Set(excluded);
  const finishedIds = payload.map((p) => p.gers_id).filter((id) => !excludedSet.has(id));
  return { excluded, finishedIds };
}

/**
 * Warm website scrapes for places (batched edge invokes).
 * Closest / priority IDs should be passed first when awaiting a subset.
 */
export async function ensureWebsiteScrapes(
  places: ScrapeSeed[],
  options?: { limit?: number; awaitBatches?: number }
): Promise<string[]> {
  const withSites = places.filter((p) => p.id && p.website_url);
  const capped = withSites.slice(0, options?.limit ?? SEARCH_CONFIG.MAX_WEBSITE_SCRAPES);
  if (capped.length === 0) return [];

  const missing = await findMissingScrapeIds(capped.map((p) => p.id));
  const toScrape = capped.filter((p) => missing.has(p.id));
  if (toScrape.length === 0) return [];

  const batches = chunk(toScrape, SEARCH_CONFIG.WEBSITE_SCRAPE_BATCH_SIZE);
  const awaitCount = options?.awaitBatches ?? batches.length;
  const excludedAll: string[] = [];

  for (let i = 0; i < batches.length; i++) {
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
  return excludedAll;
}

export type ScrapeRaceResult = {
  /** Closest-first IDs that finished scrape (not dead), capped at targetUsable. */
  readyIds: string[];
  excludedPlaceIds: string[];
};

/**
 * Queue up to 120 closest sites, scrape in parallel, stop when we have ~60 usable
 * or the wait budget expires. Remaining work continues in the background.
 */
export async function raceWebsiteScrapesForAi(
  placesClosestFirst: ScrapeSeed[],
  options?: {
    queueSize?: number;
    targetUsable?: number;
    timeoutMs?: number;
  },
): Promise<ScrapeRaceResult> {
  const queueSize = options?.queueSize ?? SEARCH_CONFIG.AI_SCRAPE_QUEUE_SIZE;
  const targetUsable = options?.targetUsable ?? SEARCH_CONFIG.MAX_AI_OVERVIEWS;
  const timeoutMs = options?.timeoutMs ?? SEARCH_CONFIG.AI_SCRAPE_WAIT_MS;

  const queue = placesClosestFirst
    .filter((p) => p.id && p.website_url)
    .slice(0, queueSize);
  const order = queue.map((p) => p.id);
  if (order.length === 0) return { readyIds: [], excludedPlaceIds: [] };

  const ready = new Set<string>();
  const dead = new Set<string>();
  const excludedAll: string[] = [];

  const { data: cachedRows, error: cacheErr } = await supabase
    .from('v2_website_scrape_cache')
    .select('gers_id, is_dead, scraped_at')
    .in('gers_id', order);
  if (cacheErr) {
    console.warn('[ScrapeCache] race cache read error:', cacheErr.message);
  } else {
    const now = Date.now();
    for (const row of cachedRows ?? []) {
      const age = now - new Date(row.scraped_at).getTime();
      if (!Number.isFinite(age) || age >= SCRAPE_TTL_MS) continue;
      if (row.is_dead) {
        dead.add(row.gers_id);
        excludedAll.push(row.gers_id);
      } else {
        ready.add(row.gers_id);
      }
    }
  }

  const needFetch = queue.filter((p) => !ready.has(p.id) && !dead.has(p.id));
  const batches = chunk(needFetch, SEARCH_CONFIG.WEBSITE_SCRAPE_BATCH_SIZE);

  let settled = 0;
  const inflight = batches.map((batch) =>
    invokeScrapeBatch(batch).then((result) => {
      for (const id of result.excluded) {
        dead.add(id);
        ready.delete(id);
        excludedAll.push(id);
      }
      for (const id of result.finishedIds) {
        if (!dead.has(id)) ready.add(id);
      }
      settled += 1;
      return result;
    }),
  );

  const deadline = Date.now() + timeoutMs;
  const usableCount = () => order.filter((id) => ready.has(id)).length;

  while (Date.now() < deadline && usableCount() < targetUsable && settled < inflight.length) {
    await Promise.race([Promise.allSettled(inflight), sleep(350)]);
  }

  void Promise.allSettled(inflight).then(() => {
    console.log(
      `[ScrapeCache] race background finished; ready=${usableCount()} dead=${dead.size}`,
    );
  });

  if (excludedAll.length > 0) {
    await markRejectedPlaceIds([...new Set(excludedAll)]);
  }

  const readyIds = order.filter((id) => ready.has(id)).slice(0, targetUsable);
  console.log(
    `[ScrapeCache] race: queued=${order.length} ready=${readyIds.length}/${targetUsable} ` +
      `dead=${dead.size} waitedMs<=${timeoutMs}`,
  );
  return { readyIds, excludedPlaceIds: [...new Set(excludedAll)] };
}
