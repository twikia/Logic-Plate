import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

/**
 * Google Places searchText search radius per H3 resolution (meters).
 * These values mirror core/searchConfig.ts → RES7_CELL_SEARCH_RADIUS_METERS etc.
 */
const SEARCH_RADIUS_BY_RESOLUTION: Record<number, number> = {
  8: 600,
  7: 1500,
  6: 4000,
};

/**
 * Field mask for Google Places API responses.
 * 'nextPageToken' must be included so pagination tokens are returned.
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
  'nextPageToken',
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
     *   cells: Array<{ cellId: string; lat?: number; lng?: number; pageToken?: string }>
     *   resolution: 6 | 7 | 8
     *   page: 1 | 2 | 3
     *
     * For page 1: cells have lat/lng and no pageToken (fresh search).
     * For pages 2/3: cells have pageToken (continuation); lat/lng are optional and ignored.
     */
    const { cells, resolution: rawRes = 7, page = 1 } = body;
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
    const returnedPageTokens: Record<string, string> = {};
    const failedCells: { cellId: string; reason: string }[] = [];

    // Process all cells in parallel
    await Promise.all(cells.map(async (cell: { cellId: string; lat?: number; lng?: number; pageToken?: string }) => {
      try {
        let requestBody: Record<string, unknown>;

        if (cell.pageToken) {
          // Continuation page: Google remembers all original search params from the token.
          // Only the pageToken is required.
          requestBody = { pageToken: cell.pageToken };
        } else {
          // Fresh search using Places API Text Search (supports nextPageToken for pagination).
          // Default rankPreference is RELEVANCE — Google scores results by quality,
          // popularity, and match quality across the full locationRestriction circle.
          // We deliberately do NOT use rankPreference=DISTANCE: that mode is incompatible
          // with locationRestriction and would pin results to the cell centre rather than
          // returning the best places anywhere inside the cell.
          if (cell.lat == null || cell.lng == null) {
            throw new Error(`Cell ${cell.cellId} is missing lat/lng for a fresh (page 1) search.`);
          }
          requestBody = {
            textQuery: 'restaurant',
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: cell.lat, longitude: cell.lng },
                radius: searchRadius,
              },
            },
          };
        }

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
          // Log the raw Google error so it's visible in the Supabase Function logs
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
        const places: any[] = data.places ?? [];
        const nextPageToken: string | undefined = data.nextPageToken;

        newlyFetchedRestaurants.push({ cellId: cell.cellId, places });
        if (nextPageToken) {
          returnedPageTokens[cell.cellId] = nextPageToken;
        }

        // --- Supabase cache write (always runs, even if client exits) ---
        if (places.length > 0) {
          if (page === 1) {
            // Page 1: fresh overwrite of the cell's cache entry
            const { error: dbError } = await supabase
              .from('restaurant_cache')
              .upsert({
                id: cell.cellId,
                restaurants: places,
                fetched_at: new Date().toISOString(),
              }, { onConflict: 'id' });
            if (dbError) {
              console.error(`[page 1] Supabase upsert error for cell ${cell.cellId}:`, dbError.message);
            }
          } else {
            // Pages 2/3: append-merge new places onto the existing DB entry.
            // Preserves the original fetched_at timestamp from page 1.
            // This ensures all page results persist in the DB even if the client exits.
            const { data: existing, error: readErr } = await supabase
              .from('restaurant_cache')
              .select('restaurants, fetched_at')
              .eq('id', cell.cellId)
              .maybeSingle();

            if (readErr) {
              console.error(`[page ${page}] Supabase read error for cell ${cell.cellId}:`, readErr.message);
            } else {
              const existingPlaces: any[] = existing?.restaurants ?? [];
              const existingIds = new Set(existingPlaces.map((p: any) => p.id).filter(Boolean));
              const uniqueNew = places.filter((p: any) => p.id && !existingIds.has(p.id));

              if (uniqueNew.length > 0) {
                const merged = [...existingPlaces, ...uniqueNew];
                const { error: updateErr } = await supabase
                  .from('restaurant_cache')
                  .update({ restaurants: merged })
                  .eq('id', cell.cellId);
                if (updateErr) {
                  console.error(`[page ${page}] Supabase append error for cell ${cell.cellId}:`, updateErr.message);
                }
              }
            }
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
    const hasNextPage = Object.keys(returnedPageTokens).length > 0;

    console.log(
      `[fetch-restaurants] Page ${page} (res ${resolution}): ${cells.length} cells → ` +
      `${totalPlacesReturned} places. Has next page: ${hasNextPage}.`
    );

    return new Response(JSON.stringify({
      newlyFetchedRestaurants,
      pageTokens: returnedPageTokens,   // { cellId: nextPageToken } — empty if no more pages
      failedCells,
      page,
      totalPlacesReturned,
      hasNextPage,
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
