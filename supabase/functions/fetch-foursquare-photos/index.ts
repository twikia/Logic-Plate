import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Auth Check
  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    console.error('[Auth] Unauthorized access attempt. Secret mismatch.');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let requestPlaceId: string | null = null;
  let requestFsqId: string | null = null;

  try {
    const body = await req.json();
    const { place_id, name, latitude, longitude, phone_number } = body;
    requestPlaceId = place_id;
    
    console.log(`[Start] Processing ${name} (${place_id}) at ${latitude},${longitude}. Phone: ${phone_number || 'N/A'}`);

    if (!place_id || !name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      console.error('[Validation] Missing required fields:', body);
      return new Response(JSON.stringify({ error: 'place_id, name, latitude, longitude are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawFsqKey = Deno.env.get('FOURSQUARE_API_KEY');
    if (!rawFsqKey) {
      throw new Error('FOURSQUARE_API_KEY is missing from edge function environment');
    }
    const foursquareApiKey = rawFsqKey.trim();

    // New API uses a Service Key with Bearer auth and a versioned header
    const fsqHeaders = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${foursquareApiKey}`,
      'X-Places-Api-Version': '2025-06-17',
      "X-Users-Api-Version": "2025-06-17",
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let fsqId: string | null = null;
    let photoUrls: string[] = [];

    // --- STEP 1: MATCH ---
    console.log(`[Foursquare] Attempting MATCH for: ${name}`);
    const matchUrl = new URL('https://places-api.foursquare.com/places/match');
    matchUrl.searchParams.set('name', String(name));
    matchUrl.searchParams.set('ll', `${latitude},${longitude}`);
    matchUrl.searchParams.set('fields', 'fsq_place_id,photos');

    if (phone_number) {
      const sanitizedPhone = phone_number.replace(/[^\d+]/g, '');
      if (sanitizedPhone) {
        console.log(`[Foursquare] Adding phone to match: ${sanitizedPhone}`);
        matchUrl.searchParams.set('phone', sanitizedPhone);
      }
    }

    const matchRes = await fetch(matchUrl.toString(), { headers: fsqHeaders });

    if (matchRes.ok) {
      const matchData = await matchRes.json();
      // New API returns fsq_place_id instead of fsq_id
      fsqId = matchData?.place?.fsq_place_id || matchData?.fsq_place_id || null;
      if (fsqId) {
        console.log(`[Foursquare] MATCH SUCCESS: Found ID ${fsqId}`);
        const photos = Array.isArray(matchData?.place?.photos ?? matchData?.photos) 
          ? (matchData?.place?.photos ?? matchData?.photos) 
          : [];
        photoUrls = photos
          .map((p: any) => p.prefix && p.suffix ? `${p.prefix}original${p.suffix}` : null)
          .filter((u: any) => u !== null);
        console.log(`[Foursquare] MATCH result had ${photoUrls.length} photos.`);
      }
    } else {
      const matchErr = await matchRes.text();
      console.log(`[Foursquare] MATCH FAILED (Status ${matchRes.status}):`, matchErr);
    }

    // --- STEP 2: SEARCH FALLBACK ---
    if (!fsqId) {
      console.log(`[Foursquare] Attempting SEARCH fallback for: ${name}`);
      const searchUrl = new URL('https://places-api.foursquare.com/places/search');
      searchUrl.searchParams.set('query', String(name));
      searchUrl.searchParams.set('ll', `${latitude},${longitude}`);
      searchUrl.searchParams.set('radius', '250');
      searchUrl.searchParams.set('limit', '1');
      searchUrl.searchParams.set('fields', 'fsq_place_id,name,photos');

      const searchRes = await fetch(searchUrl.toString(), { headers: fsqHeaders });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const firstResult = searchData?.results?.[0];
        if (firstResult) {
          // New API returns fsq_place_id instead of fsq_id
          fsqId = firstResult.fsq_place_id;
          console.log(`[Foursquare] SEARCH SUCCESS: Found ${firstResult.name} (${fsqId})`);
          const photos = Array.isArray(firstResult.photos) ? firstResult.photos : [];
          photoUrls = photos
            .map((p: any) => p.prefix && p.suffix ? `${p.prefix}original${p.suffix}` : null)
            .filter((u: any) => u !== null);
          console.log(`[Foursquare] SEARCH result had ${photoUrls.length} photos.`);
        } else {
          console.log('[Foursquare] SEARCH result was empty.');
        }
      } else {
        const searchErr = await searchRes.text();
        console.error(`[Foursquare] SEARCH ERROR (Status ${searchRes.status}):`, searchErr);
      }
    }

    // --- STEP 3: DEEP PHOTO FETCH ---
    if (fsqId && photoUrls.length === 0) {
      console.log(`[Foursquare] ID found but no photos. Fetching from /photos endpoint for ${fsqId}`);
      // New endpoint uses fsq_place_id in the path
      const photosRes = await fetch(`https://places-api.foursquare.com/places/${fsqId}/photos?limit=10&sort=POPULAR`, {
        headers: fsqHeaders,
      });

      if (photosRes.ok) {
        const photosData = await photosRes.json();
        photoUrls = photosData
          .map((p: any) => p.prefix && p.suffix ? `${p.prefix}original${p.suffix}` : null)
          .filter((u: any) => u !== null);
        console.log(`[Foursquare] PHOTOS endpoint found ${photoUrls.length} photos.`);
      } else {
        const photoErr = await photosRes.text();
        console.error(`[Foursquare] PHOTOS ERROR (Status ${photosRes.status}):`, photoErr);
      }
    }

    requestFsqId = fsqId;

    // --- STEP 4: DB CACHE ---
    console.log(`[Supabase] Upserting to cache for ${place_id}...`);
    const { error: upsertError } = await supabase
      .from('foursquare_photo_cache')
      .upsert({
        google_place_id: place_id,
        fsq_id: fsqId,
        photo_urls: photoUrls,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'google_place_id' });

    if (upsertError) {
      console.error('[Supabase] CACHE UPSERT FAILED:', upsertError);
    } else {
      console.log('[Supabase] Cache upsert successful.');
    }

    // --- STEP 5: FINAL RESPONSE ---
    if (photoUrls.length > 0) {
      console.log(`[Done] Returning ${photoUrls.length} photos.`);
      return new Response(JSON.stringify({ photo_urls: photoUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log('[Done] No photos found for this restaurant.');
      return new Response(JSON.stringify({ error: 'No photos found', fsq_id: fsqId }), {
        status: 404, // Consider it an error so frontend can handle it
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('[Global Error] Edge Function crashed:', error);

    // Try to cache the failure so we don't keep hammering the API
    if (requestPlaceId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from('foursquare_photo_cache').upsert({
          google_place_id: requestPlaceId,
          fsq_id: requestFsqId,
          photo_urls: [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'google_place_id' });
        console.log('[Supabase] Cached empty result after crash.');
      } catch (e) {
        console.error('[Supabase] Failed to cache empty result after crash:', e);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
