import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

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
    const { missingCells } = await req.json();
    if (!missingCells || !Array.isArray(missingCells)) {
      return new Response(JSON.stringify({ error: 'missingCells array is required' }), {
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
    
    // Create Supabase client with Service Role Key to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const newlyFetchedRestaurants: { cellId: string; places: any[] }[] = [];

    // Fetch Google Places concurrently (limit to 3 at a time to prevent rate limits)
    const fetchTasks = missingCells.map((cell: {cellId: string, lat: number, lng: number}) => async () => {
      try {
        const url = 'https://places.googleapis.com/v1/places:searchNearby';
        const requestBody = {
          includedTypes: [
            'restaurant', 'cafe', 'bar', 'coffee_shop', 'fast_food_restaurant', 
            'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'ice_cream_shop',
            'steak_house', 'seafood_restaurant', 'american_restaurant', 'breakfast_restaurant',
            'brunch_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant',
            'mexican_restaurant', 'thai_restaurant', 'vegetarian_restaurant', 'vegan_restaurant',
            'meal_takeaway', 'meal_delivery'
          ],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: {
                latitude: cell.lat,
                longitude: cell.lng,
              },
              radius: 1200.0,
            },
          },
        };

        const fieldMask = 'places.id,places.name,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.viewport,places.plusCode,places.types,places.primaryType,places.primaryTypeDisplayName,places.businessStatus,places.priceLevel,places.priceRange,places.rating,places.userRatingCount,places.currentOpeningHours,places.currentSecondaryOpeningHours,places.regularOpeningHours,places.regularSecondaryOpeningHours,places.utcOffsetMinutes,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.editorialSummary,places.reviews,places.servesBreakfast,places.servesBrunch,places.servesLunch,places.servesDinner,places.servesVegetarianFood,places.servesWine,places.servesBeer,places.servesCocktails,places.servesCoffee,places.servesDessert,places.goodForChildren,places.goodForGroups,places.goodForWatchingSports,places.liveMusic,places.menuForChildren,places.outdoorSeating,places.reservable,places.restroom,places.takeout,places.delivery,places.dineIn,places.curbsidePickup,places.allowsDogs,places.paymentOptions,places.parkingOptions,places.accessibilityOptions,places.evChargeOptions,places.fuelOptions,places.iconBackgroundColor,places.iconMaskBaseUri';

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
          throw new Error(`Google Places API Error: ${response.status}`);
        }

        const data = await response.json();
        const places = data.places || [];
        
        newlyFetchedRestaurants.push({ cellId: cell.cellId, places });

        // Upsert to Supabase using service role key (bypasses RLS)
        const { error: dbError } = await supabase
          .from('restaurant_cache')
          .upsert({
            id: cell.cellId,
            restaurants: places,
            fetched_at: new Date().toISOString()
          });

        if (dbError) {
          console.error(`Supabase Upsert Error for cell ${cell.cellId}:`, dbError);
        }

      } catch (error) {
        console.error(`Failed to fetch places for cell ${cell.cellId}:`, error);
        newlyFetchedRestaurants.push({ cellId: cell.cellId, places: [] });
      }
    });

    // Run tasks with concurrency limit of 3
    const executing: Promise<void>[] = [];
    for (const task of fetchTasks) {
      const p = task().then(() => {
        executing.splice(executing.indexOf(p), 1);
      });
      executing.push(p);
      if (executing.length >= 3) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    // Return the newly fetched data directly to the client
    return new Response(JSON.stringify({ newlyFetchedRestaurants }), {
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
