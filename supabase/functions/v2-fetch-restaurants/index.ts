import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import {
  extractOsmField,
  parseOsmOpeningHours,
  parseOsmPriceRange,
} from "../_shared/osmOpeningHours.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Overture Maps API Config ─────────────────────────────────────────────────
// REST API: GET https://api.overturemapsapi.com/places
// Auth: x-api-key header
// Params: lat, lng, radius (meters), categories (comma-separated), limit
// Returns: { features: [{ id (GERS), properties: { name, categories, websites, addresses, ... } }] }

const OVERTURE_API_BASE = 'https://api.overturemapsapi.com/places';

// H3 res-7 inscribed radius (apothem) = edge × √3/2 — mirrors core/searchConfig.ts
const OVERTURE_SEARCH_RADIUS_METERS = 1057.052559;

const MAX_RESULTS_PER_CELL = 350;

const FOOD_CATEGORIES = [
  'restaurant',
  'fast_food_restaurant',
  'cafe',
  'coffee_shop',
  'bar',
  'pizza_restaurant',
  'hamburger_restaurant',
  'sandwich_shop',
  'ice_cream_shop',
  'bakery',
  'dessert_shop',
  'dessert_restaurant',
  'donut_shop',
  'steak_house',
  'seafood_restaurant',
  'american_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'italian_restaurant',
  'japanese_restaurant',
  'korean_restaurant',
  'mexican_restaurant',
  'thai_restaurant',
  'vegetarian_restaurant',
  'vegan_restaurant',
  'food_and_drink',
  'meal_takeaway',
].join(',');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const OVERTURE_MAX_RETRIES = 3;
const OVERTURE_RETRY_BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOvertureRateLimited(status: number): boolean {
  return status === 429 || status === 503;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OvertureFeature = {
  id: string;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    names?: {
      primary?: string;
      common?: Record<string, string>;
    };
    categories?: {
      primary?: string;
      alternate?: string[];
    };
    basic_category?: string;
    taxonomy?: {
      primary?: string;
      alternate?: string[];
    };
    confidence?: number;
    websites?: unknown;
    website?: unknown;
    phones?: unknown;
    addresses?: Array<{
      freeform?: string;
      locality?: string;
      postcode?: string;
      region?: string;
      country?: string;
    }>;
    socials?: unknown;
    emails?: string[];
    brand?: {
      names?: { common?: Array<{ value: string; language?: string }> };
      wikidata?: string;
    };
    sources?: Array<{ property?: string; dataset?: string; record_id?: string }>;
    operating_status?: string;
    opening_hours?: unknown;
    hours?: unknown;
    price_range?: unknown;
    price_rating?: unknown;
    tags?: Record<string, unknown>;
  };
};

type OvertureApiResponse = {
  features?: OvertureFeature[];
  type?: string;
};

function parseOvertureFeatures(raw: unknown): OvertureFeature[] {
  if (Array.isArray(raw)) return raw as OvertureFeature[];
  if (raw && typeof raw === 'object') {
    const features = (raw as OvertureApiResponse).features;
    if (Array.isArray(features)) return features;
  }
  return [];
}

function jsonErrorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ error: message, code, statusCode: status, ...extra }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

type NormalizedPlace = {
  id: string;
  name: string;
  category: string;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  operating_status: string;
  businessStatus: string;
  priceTier: number | null;
  regularOpeningHours: { weekdayDescriptions: string[] } | null;
  location: {
    latitude: number;
    longitude: number;
  };
};

function mapOperatingStatus(raw: string | undefined): { operating_status: string; businessStatus: string } {
  const normalized = String(raw || 'open').toLowerCase();
  if (normalized === 'permanently_closed') {
    return { operating_status: 'permanently_closed', businessStatus: 'CLOSED_PERMANENTLY' };
  }
  if (normalized === 'temporarily_closed') {
    return { operating_status: 'temporarily_closed', businessStatus: 'CLOSED_TEMPORARILY' };
  }
  return { operating_status: 'open', businessStatus: 'OPERATIONAL' };
}

// ─── Normalizer helpers ───────────────────────────────────────────────────────

const SOCIAL_HOSTS = /(?:facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|yelp|tripadvisor|doordash|ubereats|grubhub)\./i;

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname === 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrlFromEntry(entry: unknown): string | null {
  if (typeof entry === 'string') return normalizeWebsiteUrl(entry);
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    for (const key of ['url', 'value', 'uri', 'href']) {
      if (typeof obj[key] === 'string') {
        const normalized = normalizeWebsiteUrl(obj[key] as string);
        if (normalized) return normalized;
      }
    }
  }
  return null;
}

function extractWebsiteUrl(props: OvertureFeature['properties']): string | null {
  const candidates: unknown[] = [];
  if (Array.isArray(props.websites)) candidates.push(...props.websites);
  if (props.website != null) candidates.push(props.website);
  if (Array.isArray(props.socials)) candidates.push(...props.socials);

  for (const entry of candidates) {
    const url = extractUrlFromEntry(entry);
    if (url && !SOCIAL_HOSTS.test(url)) return url;
  }

  for (const entry of candidates) {
    const url = extractUrlFromEntry(entry);
    if (url) return url;
  }

  return null;
}

function extractPhone(props: OvertureFeature['properties']): string | null {
  const phones = props.phones;
  if (!phones) return null;
  if (typeof phones === 'string') return phones.trim() || null;
  if (Array.isArray(phones)) {
    for (const entry of phones) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim();
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.phone === 'string' && obj.phone.trim()) return obj.phone.trim();
        if (typeof obj.value === 'string' && obj.value.trim()) return obj.value.trim();
      }
    }
  }
  return null;
}

function extractPlaceName(props: OvertureFeature['properties']): string {
  if (props.name?.trim()) return props.name.trim();
  if (props.names?.primary?.trim()) return props.names.primary.trim();
  const common = props.names?.common;
  if (common && typeof common === 'object') {
    for (const value of Object.values(common)) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

function normalizeOvertureFeature(feature: OvertureFeature): NormalizedPlace | null {
  if (!feature?.id || !feature?.geometry?.coordinates) return null;

  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const props = feature.properties ?? {};
  const name = extractPlaceName(props);
  if (!name) return null;

  const category =
    props.basic_category ||
    props.taxonomy?.primary ||
    props.categories?.primary ||
    'restaurant';

  const addr = props.addresses?.[0];
  const address = addr?.freeform?.trim() || null;
  const city = addr?.locality?.trim() || null;
  const country = addr?.country?.trim() || null;
  const status = mapOperatingStatus(props.operating_status);
  const propsRecord = props as Record<string, unknown>;

  const priceRaw = extractOsmField(propsRecord, ['price_range', 'price_rating', 'priceRange', 'priceRating']);
  const priceTier = parseOsmPriceRange(priceRaw);

  const hoursRaw = extractOsmField(propsRecord, ['opening_hours', 'hours', 'openingHours']);
  const weekdayDescriptions = parseOsmOpeningHours(hoursRaw);
  const regularOpeningHours =
    weekdayDescriptions.length === 7 ? { weekdayDescriptions } : null;

  return {
    id: feature.id,
    name,
    category,
    website_url: extractWebsiteUrl(props),
    phone: extractPhone(props),
    address,
    city,
    country,
    operating_status: status.operating_status,
    businessStatus: status.businessStatus,
    priceTier,
    regularOpeningHours,
    location: { latitude: lat, longitude: lng },
  };
}

// ─── Overture API Fetch ───────────────────────────────────────────────────────

async function fetchOvertureNearby(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<NormalizedPlace[]> {
  const url = new URL(OVERTURE_API_BASE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('radius', String(OVERTURE_SEARCH_RADIUS_METERS));
  url.searchParams.set('categories', FOOD_CATEGORIES);
  url.searchParams.set('limit', String(MAX_RESULTS_PER_CELL));
  url.searchParams.set('format', 'json');

  let lastRateLimitError: Error | null = null;

  for (let attempt = 0; attempt <= OVERTURE_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (isOvertureRateLimited(response.status)) {
        const errText = await response.text();
        lastRateLimitError = new Error(`Overture API rate limited: ${response.status}`);
        if (attempt < OVERTURE_MAX_RETRIES) {
          const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
          const delay = retryAfter ?? OVERTURE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[v2-fetch-restaurants] Overture ${response.status} at (${lat.toFixed(4)}, ${lng.toFixed(4)}), ` +
            `retry ${attempt + 1}/${OVERTURE_MAX_RETRIES} in ${delay}ms: ${errText.slice(0, 120)}`
          );
          await sleep(delay);
          continue;
        }
        console.error(
          `[v2-fetch-restaurants] Overture rate limit exhausted after ${OVERTURE_MAX_RETRIES} retries: ${errText.slice(0, 300)}`
        );
        throw lastRateLimitError;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[v2-fetch-restaurants] Overture API error ${response.status}: ${errText.slice(0, 300)}`);
        throw new Error(`Overture API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const raw = await response.json();
      const features = parseOvertureFeatures(raw);
      console.log(`[v2-fetch-restaurants] Overture returned ${features.length} raw features at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

      const places: NormalizedPlace[] = [];
      for (const feature of features) {
        const normalized = normalizeOvertureFeature(feature);
        if (normalized) places.push(normalized);
      }

      const seen = new Set<string>();
      const deduped = places.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      if (features.length > 0 && deduped.length === 0) {
        throw new Error(
          `Overture returned ${features.length} features but none normalized at (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        );
      }

      return deduped;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Overture API request timed out');
      }
      throw err;
    }
  }

  throw lastRateLimitError ?? new Error('Overture API rate limited');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return jsonErrorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  try {
    const body = await req.json();
    const { cells } = body;

    if (!cells || !Array.isArray(cells) || cells.length === 0) {
      return jsonErrorResponse(400, 'INVALID_REQUEST', 'cells array is required');
    }

    const overtureApiKey = Deno.env.get('OVERTURE_MAPS_KEY');
    if (!overtureApiKey) throw new Error('OVERTURE_MAPS_KEY missing from edge function environment');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing');
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = Date.now();

    const cellIdsToFetch = cells.map((c: { cellId: string }) => c.cellId);
    const { data: existingRows, error: dbReadError } = await supabase
      .from('v2_restaurant_cell_cache')
      .select('id, restaurants, fetched_at')
      .in('id', cellIdsToFetch);

    if (dbReadError) {
      console.warn(`[v2-fetch-restaurants] Supabase cache read error: ${dbReadError.message}`);
    }

    const cachedMap = new Map<string, NormalizedPlace[]>();
    for (const row of (existingRows ?? [])) {
      const fetchedAt = new Date(row.fetched_at).getTime();
      if (now - fetchedAt < CACHE_TTL_MS && Array.isArray(row.restaurants) && row.restaurants.length > 0) {
        cachedMap.set(row.id, row.restaurants as NormalizedPlace[]);
      }
    }

    console.log(`[v2-fetch-restaurants] Supabase v2 cell cache: ${cachedMap.size} / ${cellIdsToFetch.length} cells cached`);

    const newlyFetchedRestaurants: { cellId: string; places: NormalizedPlace[] }[] = [];
    const failedCells: { cellId: string; reason: string }[] = [];

    for (const [cellId, places] of cachedMap) {
      newlyFetchedRestaurants.push({ cellId, places });
    }

    const missingCells = cells.filter((c: { cellId: string }) => !cachedMap.has(c.cellId));

    await Promise.all(
      missingCells.map(async (cell: { cellId: string; lat?: number; lng?: number }) => {
        try {
          if (cell.lat == null || cell.lng == null) {
            throw new Error(`Cell ${cell.cellId} is missing lat/lng`);
          }

          const places = await fetchOvertureNearby(cell.lat, cell.lng, overtureApiKey);
          newlyFetchedRestaurants.push({ cellId: cell.cellId, places });

          if (places.length > 0) {
            const { error: upsertError } = await supabase
              .from('v2_restaurant_cell_cache')
              .upsert(
                { id: cell.cellId, restaurants: places, fetched_at: new Date().toISOString() },
                { onConflict: 'id' }
              );
            if (upsertError) {
              console.error(`[v2-fetch-restaurants] Supabase upsert error for cell ${cell.cellId}: ${upsertError.message}`);
            } else {
              console.log(`[v2-fetch-restaurants] Supabase upsert OK: cell ${cell.cellId} → ${places.length} places`);
            }
          } else {
            console.log(`[v2-fetch-restaurants] No places found for cell ${cell.cellId} — skipping upsert`);
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[v2-fetch-restaurants] Failed cell ${cell.cellId}: ${reason}`);
          failedCells.push({ cellId: cell.cellId, reason });
        }
      })
    );

    if (newlyFetchedRestaurants.length === 0 && failedCells.length > 0) {
      return jsonErrorResponse(500, 'ALL_CELLS_FAILED', 'All cells failed', { failedCells });
    }

    const totalPlacesReturned = newlyFetchedRestaurants.reduce(
      (sum, r) => sum + (r.places?.length ?? 0),
      0
    );

    console.log(
      `[v2-fetch-restaurants] Complete: res 7, ${cells.length} cells → ${totalPlacesReturned} total places returned`
    );

    return new Response(
      JSON.stringify({ newlyFetchedRestaurants, failedCells, totalPlacesReturned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[v2-fetch-restaurants] Unhandled error:', error);
    return jsonErrorResponse(500, 'INTERNAL_ERROR', message);
  }
});
