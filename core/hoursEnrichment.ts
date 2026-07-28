import { supabase } from './supabaseClient';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeWeekdayDescriptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  const lines = raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  return lines.length === 7 ? lines : null;
}

/** Load JSON-LD weekday hours from scrape cache (no AI). */
export async function loadScrapeHoursByIds(
  ids: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;

  for (const part of chunk(unique, 200)) {
    const { data, error } = await supabase
      .from('v2_website_scrape_cache')
      .select('gers_id, json_ld_weekday_descriptions, is_dead')
      .in('gers_id', part);
    if (error) {
      console.warn('[HoursEnrichment] scrape hours read error:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      if (row.is_dead) continue;
      const days = normalizeWeekdayDescriptions(row.json_ld_weekday_descriptions);
      if (days) out.set(row.gers_id, days);
    }
  }
  return out;
}

/**
 * Prefer existing place hours; else promote scraped JSON-LD hours onto the place
 * so map/home see hours without waiting for AI overview generation.
 */
export function mergeScrapeHoursOntoPlaces<
  T extends {
    id?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] } | null;
  },
>(places: T[], scrapeHours: Map<string, string[]>): T[] {
  if (scrapeHours.size === 0) return places;
  return places.map((place) => {
    const id = place.id;
    if (!id) return place;
    const existing = place.regularOpeningHours?.weekdayDescriptions;
    if (Array.isArray(existing) && existing.length === 7) return place;
    const scraped = scrapeHours.get(id);
    if (!scraped || scraped.length !== 7) return place;
    return {
      ...place,
      regularOpeningHours: { weekdayDescriptions: scraped },
    };
  });
}

export async function enrichPlacesWithScrapeHours<
  T extends {
    id?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] } | null;
  },
>(places: T[]): Promise<T[]> {
  const need = places
    .filter((p) => p.id && (p.regularOpeningHours?.weekdayDescriptions?.length ?? 0) !== 7)
    .map((p) => p.id!) ;
  if (need.length === 0) return places;
  const hours = await loadScrapeHoursByIds(need);
  return mergeScrapeHoursOntoPlaces(places, hours);
}
