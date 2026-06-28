import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

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

// Search radius per H3 resolution (meters).
// Res 8 is tight (600m cell), res 6 is large (2800m cell).
// We use slightly larger radii than Google to capture cell edges.
const SEARCH_RADIUS_BY_RESOLUTION: Record<number, number> = {
  8: 650,
  7: 1100,
  6: 3000,
};

// Overture food & beverage categories to filter for restaurants.
// The Overture taxonomy uses these category strings.
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

// Max results per API call. Overture API may have its own cap.
// We request 50 per cell; if the API returns fewer, that's fine.
const MAX_RESULTS_PER_CELL = 50;

// Cache TTL: 30 days. Overture data is relatively stable.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

type OvertureFeature = {
  id: string; // GERS ID (UUID)
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    name?: string;
    categories?: {
      primary?: string;
      alternate?: string[];
    };
    // New taxonomy fields (2025+)
    basic_category?: string;
    taxonomy?: {
      primary?: string;
      alternate?: string[];
    };
    confidence?: number;
    websites?: string[];
    phones?: string[];
    addresses?: Array<{
      freeform?: string;
      locality?: string;
      postcode?: string;
      region?: string;
      country?: string;
    }>;
    socials?: string[];
    emails?: string[];
    brand?: {
      names?: { common?: Array<{ value: string; language?: string }> };
      wikidata?: string;
    };
    sources?: Array<{ property?: string; dataset?: string; record_id?: string }>;
  };
};

type OvertureApiResponse = {
  features?: OvertureFeature[];
  type?: string;
};

type NormalizedPlace = {
  id: string;          // GERS ID — primary key replacing Google place_id
  name: string;
  category: string;    // primary Overture category (e.g. "restaurant")
  website_url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  location: {
    latitude: number;
    longitude: number;
  };
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeOvertureFeature(feature: OvertureFeature): NormalizedPlace | null {
  if (!feature?.id || !feature?.geometry?.coordinates) return null;

  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const props = feature.properties ?? {};
  const name = props.name?.trim() || '';
  if (!name) return null; // skip unnamed places

  // Prefer new taxonomy fields, fall back to legacy categories
  const category =
    props.basic_category ||
    props.taxonomy?.primary ||
    props.categories?.primary ||
    'restaurant';

  const websiteUrl = props.websites?.[0]?.trim() || null;
  const phone = props.phones?.[0]?.trim() || null;

  const addr = props.addresses?.[0];
  const address = addr?.freeform?.trim() || null;
  const city = addr?.locality?.trim() || null;
  const country = addr?.country?.trim() || null;

  return {
    id: feature.id,
    name,
    category,
    website_url: websiteUrl,
    phone,
    address,
    city,
    country,
    location: { latitude: lat, longitude: lng },
  };
}

// ─── Overture API Fetch ───────────────────────────────────────────────────────

async function fetchOvertureNearby(
  lat: number,
  lng: number,
  radiusMeters: number,
  apiKey: string,
): Promise<NormalizedPlace[]> {
  const url = new URL(OVERTURE_API_BASE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('radius', String(radiusMeters));
  url.searchParams.set('categories', FOOD_CATEGORIES);
  url.searchParams.set('limit', String(MAX_RESULTS_PER_CELL));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000); // 9s timeout

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

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[v2-fetch-restaurants] Overture API error ${response.status}: ${errText.slice(0, 300)}`);
      throw new Error(`Overture API error: ${response.status}`);
    }

    const data: OvertureApiResponse = await response.json();
    const features = data?.features ?? [];
    console.log(`[v2-fetch-restaurants] Overture returned ${features.length} raw features at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

    const places: NormalizedPlace[] = [];
    for (const feature of features) {
      const normalized = normalizeOvertureFeature(feature);
      if (normalized) places.push(normalized);
    }

    // Deduplicate by GERS ID
    const seen = new Set<string>();
    const deduplicated = places.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return deduplicated;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Auth guard
  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { cells, resolution: rawRes = 8 } = body;
    const resolution = Number(rawRes);

    if (!cells || !Array.isArray(cells) || cells.length === 0) {
      return new Response(JSON.stringify({ error: 'cells array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (![8, 7, 6].includes(resolution)) {
      return new Response(JSON.stringify({ error: `Invalid resolution ${resolution}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const overtureApiKey = Deno.env.get('OVERTURE_MAPS_KEY');
    if (!overtureApiKey) throw new Error('OVERTURE_MAPS_KEY missing from edge function environment');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing');
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const searchRadius = SEARCH_RADIUS_BY_RESOLUTION[resolution] ?? 1100;
    const now = Date.now();

    // ── Step 1: Bulk check Supabase v2 cache for all requested cells ──────────
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

    // ── Step 2: Fetch uncached cells from Overture API ────────────────────────
    const newlyFetchedRestaurants: { cellId: string; places: NormalizedPlace[] }[] = [];
    const failedCells: { cellId: string; reason: string }[] = [];

    // Return cached hits first
    for (const [cellId, places] of cachedMap) {
      newlyFetchedRestaurants.push({ cellId, places });
    }

    // Fetch misses in parallel
    const missingCells = cells.filter((c: { cellId: string }) => !cachedMap.has(c.cellId));

    await Promise.all(
      missingCells.map(async (cell: { cellId: string; lat?: number; lng?: number }) => {
        try {
          if (cell.lat == null || cell.lng == null) {
            throw new Error(`Cell ${cell.cellId} is missing lat/lng`);
          }

          const places = await fetchOvertureNearby(cell.lat, cell.lng, searchRadius, overtureApiKey);
          newlyFetchedRestaurants.push({ cellId: cell.cellId, places });

          // Write to Supabase v2 cache (non-blocking, best-effort)
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
      return new Response(JSON.stringify({ error: 'All cells failed', failedCells }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalPlacesReturned = newlyFetchedRestaurants.reduce(
      (sum, r) => sum + (r.places?.length ?? 0),
      0
    );

    console.log(
      `[v2-fetch-restaurants] Complete: res ${resolution}, ${cells.length} cells → ${totalPlacesReturned} total places returned`
    );

    return new Response(
      JSON.stringify({ newlyFetchedRestaurants, failedCells, totalPlacesReturned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[v2-fetch-restaurants] Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
