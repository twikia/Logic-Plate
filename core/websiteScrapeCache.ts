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

async function invokeScrapeBatch(places: ScrapeSeed[]): Promise<string[]> {
  const payload = places
    .filter((p) => p.id && p.website_url)
    .map((p) => ({ gers_id: p.id, website_url: p.website_url }));
  if (payload.length === 0) return [];

  const { data, error } = await supabase.functions.invoke('v2-scrape-websites', {
    body: { places: payload },
    headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
  });
  if (error) {
    console.warn('[ScrapeCache] v2-scrape-websites error:', error.message);
    return [];
  }
  const excluded = Array.isArray(data?.excludedPlaceIds)
    ? (data.excludedPlaceIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  if (excluded.length > 0) {
    await markRejectedPlaceIds(excluded);
  }
  return excluded;
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
      excludedAll.push(...(await run));
    } else {
      void run.then((ids) => {
        if (ids.length) console.log(`[ScrapeCache] background tombstoned ${ids.length}`);
      });
    }
  }
  return excludedAll;
}
