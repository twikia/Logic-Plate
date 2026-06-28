import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { normalizePlaces, healDatabaseRows } from "../_shared/normalizePlaces.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Validate shared secret to block unauthorized callers before hitting any external APIs
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
    const { missingCells, resolution: rawRes, page = 1, hasNextPage = false } = body;
    const resolution = Number(rawRes ?? 8);

    if (!missingCells || !Array.isArray(missingCells)) {
      return new Response(JSON.stringify({ error: 'missingCells array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (![8, 7, 6].includes(resolution)) {
      return new Response(JSON.stringify({ error: `Invalid resolution ${resolution}. Only resolutions 8, 7, and 6 are supported.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get env vars
    const googleMapsKey = Deno.env.get('GOOGLE_MAPS_KEY');
    if (!googleMapsKey) {
      throw new Error('GOOGLE_MAPS_KEY is missing from edge function environment');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is missing from edge function environment');
    }
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing from edge function environment');
    }
    
    // Create Supabase client with Service Role Key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const newlyFetchedRestaurants: { cellId: string; places: any[] }[] = [];
    const failedCells: { cellId: string; reason: string }[] = [];

    const cellIdsToFetch = missingCells.map((c: { cellId: string }) => c.cellId);
    const { data: existingRows } = await supabase
      .from('restaurant_cache')
      .select('id, restaurants, fetched_at')
      .in('id', cellIdsToFetch);

    const healedMap = await healDatabaseRows(supabase, existingRows || []);
    const now = Date.now();

    // Fetch all cells in parallel. The orchestrator enforces the API call cap
    // (7 cells for 0.8-mile search, 15 for 1.5-mile search) before invoking
    // this function, so the incoming array is already within safe bounds.
    const fetchTasks = missingCells.map((cell: {cellId: string, lat: number, lng: number}) => async () => {
      try {
        const cachedPlaces = healedMap.get(cell.cellId);
        const existingRow = existingRows?.find((r: { id: string }) => r.id === cell.cellId);
        if (cachedPlaces && cachedPlaces.length > 0 && existingRow) {
          const fetchedAt = new Date(existingRow.fetched_at).getTime();
          if (now - fetchedAt < 30 * 24 * 60 * 60 * 1000) {
            newlyFetchedRestaurants.push({ cellId: cell.cellId, places: cachedPlaces });
            return;
          }
        }

        let tableName = 'restaurant_cache';
        let searchRadius = 600.0;

        if (resolution === 7) {
          searchRadius = 1500.0;
        } else if (resolution === 6) {
          searchRadius = 4000.0;
        }

        const url = 'https://places.googleapis.com/v1/places:searchNearby';
        const requestBody = {
          includedTypes: [
            'restaurant', 'cafe', 'bar', 'coffee_shop', 'fast_food_restaurant',
            'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'ice_cream_shop',
            'bakery', 'dessert_shop', 'dessert_restaurant', 'donut_shop', 'candy_store',
            'chocolate_shop', 'confectionery', 'cake_shop', 'pastry_shop', 'acai_shop',
            'steak_house', 'seafood_restaurant', 'american_restaurant', 'breakfast_restaurant',
            'brunch_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant',
            'mexican_restaurant', 'thai_restaurant', 'vegetarian_restaurant', 'vegan_restaurant',
            'meal_takeaway', 'meal_delivery',
          ],
          // Mirrored from core/searchConfig.ts → PLACES_MAX_RESULTS_PER_CELL
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: {
                latitude: cell.lat,
                longitude: cell.lng,
              },
              // Mirrored from core/searchConfig.ts dynamically
              radius: searchRadius,
            },
          },
        };

        const fieldMask = [
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

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleMapsKey,
            'X-Goog-FieldMask': fieldMask,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Google Places API Error for cell ${cell.cellId}:`, errorText);
          let detailedMessage = `Google Places API Error: ${response.status}`;
          try {
            const parsed = JSON.parse(errorText);
            const baseMessage = parsed?.error?.message;
            const detailMessage = parsed?.error?.details?.[0]?.fieldViolations?.[0]?.description;
            if (baseMessage && detailMessage) {
              detailedMessage = `Google Places API Error ${response.status}: ${baseMessage} (${detailMessage})`;
            } else if (baseMessage) {
              detailedMessage = `Google Places API Error ${response.status}: ${baseMessage}`;
            }
          } catch {
          }
          throw new Error(detailedMessage);
        }

        const data = await response.json();
        const rawPlaces = data.places || [];
        const { places } = normalizePlaces(rawPlaces);
        
        newlyFetchedRestaurants.push({ cellId: cell.cellId, places });

        // Upsert to Supabase using service role key (bypasses RLS)
        const { error: dbError } = await supabase
          .from(tableName)
          .upsert({
            id: cell.cellId,
            restaurants: places,
            fetched_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (dbError) {
          console.error(`Supabase Upsert Error for cell ${cell.cellId}:`, dbError);
          throw new Error(`Supabase upsert failed: ${dbError.message}`);
        }

      } catch (error) {
        console.error(`Failed to fetch places for cell ${cell.cellId}:`, error);
        failedCells.push({
          cellId: cell.cellId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(fetchTasks.map((task: () => Promise<void>) => task()));

    if (newlyFetchedRestaurants.length === 0 && failedCells.length > 0) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch any missing cells',
        failedCells,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalPlacesReturned = newlyFetchedRestaurants.reduce((sum, item) => sum + (item.places?.length || 0), 0);
    console.log(`[fetch-missing-cells-macro] Page ${page}: Searched ${missingCells.length} cells -> Returned ${totalPlacesReturned} restaurants across ${newlyFetchedRestaurants.length} successful cells. Next page available: ${hasNextPage ? 'Yes' : 'No'}.`);

    return new Response(JSON.stringify({
      newlyFetchedRestaurants,
      failedCells,
      page,
      totalPlacesReturned,
      hasNextPage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
