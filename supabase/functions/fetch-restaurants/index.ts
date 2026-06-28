import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { normalizePlaces, healDatabaseRows } from "../_shared/normalizePlaces.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

/**
 * Google Places searchText search radius per H3 resolution (meters).
 * These values mirror core/searchConfig.ts → CELL_SEARCH_RADIUS_BY_RESOLUTION.
 */
const SEARCH_RADIUS_BY_RESOLUTION: Record<number, number> = {
  8: 1260,
  7: 3333,
  6: 8820,
};

/**
 * Field mask for Google Places API responses.
 */
const PLACES_FIELD_MASK = [
  'places.id',
  'places.name',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.viewport',
  'places.plusCode',
  'places.types',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.priceLevel',
  'places.priceRange',
  'places.rating',
  'places.userRatingCount',
  'places.currentOpeningHours',
  'places.currentSecondaryOpeningHours',
  'places.regularOpeningHours',
  'places.regularSecondaryOpeningHours',
  'places.utcOffsetMinutes',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.googleMapsUri',
  'places.accessibilityOptions',
  'places.iconBackgroundColor',
  'places.iconMaskBaseUri',
  'places.editorialSummary',
  'places.goodForGroups',
  'places.servesVegetarianFood',
  'places.takeout',
  'places.dineIn',
  'places.delivery',
  'places.liveMusic',
  'places.reservable',
].join(',');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Block unauthorized callers before hitting any external APIs
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

    /**
     * Request shape:
     *   cells: Array<{ cellId: string; lat?: number; lng?: number }>
     *   resolution: 6 | 7 | 8
     */
    const { cells, resolution: rawRes = 7 } = body;
    const resolution = Number(rawRes);

    if (!cells || !Array.isArray(cells) || cells.length === 0) {
      return new Response(JSON.stringify({ error: 'cells array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (![8, 7, 6].includes(resolution)) {
      return new Response(JSON.stringify({ error: `Invalid resolution ${resolution}. Only 6, 7, 8 are supported.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const googleMapsKey = Deno.env.get('GOOGLE_MAPS_KEY');
    if (!googleMapsKey) throw new Error('GOOGLE_MAPS_KEY missing from edge function environment');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing from edge function environment');
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing from edge function environment');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const searchRadius = SEARCH_RADIUS_BY_RESOLUTION[resolution] ?? 1500;

    const newlyFetchedRestaurants: { cellId: string; places: any[] }[] = [];
    const failedCells: { cellId: string; reason: string }[] = [];

    // Check existing db rows to heal any old paging rows or malformed structures
    const cellIdsToFetch = cells.map((c: { cellId: string }) => c.cellId);
    const { data: existingRows } = await supabase
      .from('restaurant_cache')
      .select('id, restaurants, fetched_at')
      .in('id', cellIdsToFetch);

    const healedMap = await healDatabaseRows(supabase, existingRows || []);
    const now = Date.now();

    // Process all cells in parallel (up to 7 cells)
    await Promise.all(cells.map(async (cell: { cellId: string; lat?: number; lng?: number }) => {
      try {
        if (cell.lat == null || cell.lng == null) {
          throw new Error(`Cell ${cell.cellId} is missing lat/lng.`);
        }

        const cachedPlaces = healedMap.get(cell.cellId);
        const existingRow = existingRows?.find((r: { id: string }) => r.id === cell.cellId);
        if (cachedPlaces && cachedPlaces.length > 0 && existingRow) {
          const fetchedAt = new Date(existingRow.fetched_at).getTime();
          // If valid places exist and are less than 30 days old, use healed/cached DB row
          if (now - fetchedAt < 30 * 24 * 60 * 60 * 1000) {
            newlyFetchedRestaurants.push({ cellId: cell.cellId, places: cachedPlaces });
            return;
          }
        }

        // Fresh search using Places API Text Search sorted by RELEVANCE (default when omitted)
        const requestBody = {
          textQuery: 'restaurant',
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: cell.lat, longitude: cell.lng },
              radius: searchRadius,
            },
          },
        };

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleMapsKey,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Google API] Cell ${cell.cellId} error ${response.status}:`, errorText);
          let detailedMessage = `Google Places API Error: ${response.status}`;
          try {
            const parsed = JSON.parse(errorText);
            const msg = parsed?.error?.message;
            const detail = parsed?.error?.details?.[0]?.fieldViolations?.[0]?.description;
            if (msg && detail) detailedMessage = `Google Places API Error ${response.status}: ${msg} (${detail})`;
            else if (msg) detailedMessage = `Google Places API Error ${response.status}: ${msg}`;
          } catch { /* ignore JSON parse error on error body */ }
          throw new Error(detailedMessage);
        }

        const data = await response.json();
        const rawPlaces: any[] = data.places ?? [];
        const { places } = normalizePlaces(rawPlaces);

        newlyFetchedRestaurants.push({ cellId: cell.cellId, places });

        // --- Supabase cache write ---
        if (places.length > 0) {
          const { error: dbError } = await supabase
            .from('restaurant_cache')
            .upsert({
              id: cell.cellId,
              restaurants: places,
              fetched_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          if (dbError) {
            console.error(`Supabase upsert error for cell ${cell.cellId}:`, dbError.message);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch places for cell ${cell.cellId}:`, error);
        failedCells.push({
          cellId: cell.cellId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }));

    if (newlyFetchedRestaurants.length === 0 && failedCells.length > 0) {
      return new Response(JSON.stringify({ error: 'All cells failed', failedCells }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalPlacesReturned = newlyFetchedRestaurants.reduce(
      (sum, item) => sum + (item.places?.length ?? 0), 0
    );

    console.log(
      `[fetch-restaurants] Res ${resolution}: ${cells.length} cells → ${totalPlacesReturned} places.`
    );

    return new Response(JSON.stringify({
      newlyFetchedRestaurants,
      failedCells,
      totalPlacesReturned,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[fetch-restaurants] Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
