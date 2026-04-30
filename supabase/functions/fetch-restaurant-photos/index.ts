import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_PHOTOS = 4;
const MAPILLARY_RADIUS_M = 100; // search within 100m of the restaurant

// Unsplash cuisine → curated search terms for high-quality food photography
const CUISINE_UNSPLASH_MAP: Record<string, string> = {
  italian:       'italian pasta food restaurant',
  mexican:       'mexican tacos food restaurant',
  asian:         'asian ramen noodles food',
  japanese:      'japanese sushi food restaurant',
  chinese:       'chinese dim sum food',
  thai:          'thai curry food restaurant',
  american:      'american burger grill food',
  indian:        'indian curry spices food',
  mediterranean: 'mediterranean mezze food',
  cafe:          'cafe coffee latte food',
  bars:          'cocktail bar drinks night',
  smoothies:     'smoothie bowl acai fruit',
  vegan:         'vegan salad plant based food',
  pizza:         'pizza margherita restaurant',
  dessert:       'dessert pastry bakery food',
  default:       'restaurant food dining table',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the OG image from a restaurant's website by fetching its HTML.
 * Returns up to `limit` OG/twitter image URLs.
 */
async function fetchOgImages(websiteUrl: string, limit = 2): Promise<string[]> {
  if (!websiteUrl) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();

    const urls: string[] = [];
    // Match og:image and twitter:image meta tags
    const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
    // Also match content-first form: content="..." property="og:image"
    const metaRegex2 = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi;

    for (const regex of [metaRegex, metaRegex2]) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && urls.length < limit) {
        const url = match[1].trim();
        if (url.startsWith('http') && !urls.includes(url)) {
          urls.push(url);
        }
      }
      if (urls.length >= limit) break;
    }

    console.log(`[OG] Found ${urls.length} OG images from ${websiteUrl}`);
    return urls;
  } catch (err) {
    console.log(`[OG] Failed to fetch OG image from ${websiteUrl}:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetches Mapillary street-level images near a lat/lng coordinate.
 * Returns up to `limit` image URLs. URLs are permanent CDN links.
 */
async function fetchMapillaryImages(
  lat: number,
  lng: number,
  apiKey: string,
  limit = 2
): Promise<string[]> {
  if (!apiKey) return [];
  try {
    const url = new URL('https://graph.mapillary.com/images');
    url.searchParams.set('access_token', apiKey);
    url.searchParams.set('fields', 'id,thumb_2048_url');
    url.searchParams.set('closeto', `${lng},${lat}`); // Mapillary uses lon,lat order
    url.searchParams.set('radius', String(MAPILLARY_RADIUS_M));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('is_pano', 'false'); // skip 360° panoramas for cleaner results

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[Mapillary] API error (${res.status}):`, errText.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const images: string[] = (data?.data ?? [])
      .map((img: any) => img.thumb_2048_url as string)
      .filter((u: string | undefined) => u && u.startsWith('http'));

    console.log(`[Mapillary] Found ${images.length} images near ${lat},${lng}`);
    return images.slice(0, limit);
  } catch (err) {
    console.log(`[Mapillary] Fetch failed:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetches Unsplash photos for a cuisine category.
 * Returns up to `limit` image URLs (regular size ~1080px).
 * Uses the public search endpoint with the client_id key.
 */
async function fetchUnsplashImages(
  cuisineKey: string,
  apiKey: string,
  limit = 4
): Promise<string[]> {
  if (!apiKey) return [];
  const query = CUISINE_UNSPLASH_MAP[cuisineKey] ?? CUISINE_UNSPLASH_MAP.default;
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('client_id', apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(Math.min(limit * 2, 20))); // fetch extras for randomness
    url.searchParams.set('orientation', 'landscape');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[Unsplash] API error (${res.status}):`, errText.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const results: any[] = data?.results ?? [];
    // Shuffle for variety and pick `limit`
    const shuffled = results.sort(() => Math.random() - 0.5).slice(0, limit);
    const urls = shuffled
      .map((r: any) => r?.urls?.regular as string)
      .filter((u: string | undefined) => u && u.startsWith('http'));

    console.log(`[Unsplash] Found ${urls.length} images for cuisine "${cuisineKey}" (query: "${query}")`);
    return urls;
  } catch (err) {
    console.log(`[Unsplash] Fetch failed:`, (err as Error).message);
    return [];
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Auth Check
  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    console.error('[Auth] Unauthorized access attempt.');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let requestPlaceId: string | null = null;

  try {
    const body = await req.json();
    const {
      place_id,
      name,
      latitude,
      longitude,
      website_url,
      cuisine_key,
    } = body;

    requestPlaceId = place_id;

    console.log(`[Start] Processing "${name}" (${place_id}) at ${latitude},${longitude}. Cuisine: ${cuisine_key || 'unknown'}`);

    if (!place_id || !name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(JSON.stringify({ error: 'place_id, name, latitude, longitude are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── API Keys ──────────────────────────────────────────────────────────
    const mapillaryKey  = Deno.env.get('MAPILLARY_API_KEY')?.trim() ?? '';
    const unsplashKey   = Deno.env.get('UNSPLASH_ACCESS_KEY')?.trim() ?? '';

    if (!mapillaryKey)  console.warn('[Keys] MAPILLARY_API_KEY is not set — Tier 2 will be skipped.');
    if (!unsplashKey)   console.warn('[Keys] UNSPLASH_ACCESS_KEY is not set — Tier 3 will be skipped.');

    // ── Supabase client ───────────────────────────────────────────────────
    const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase           = createClient(supabaseUrl, supabaseServiceKey);

    // ── Photo collection ──────────────────────────────────────────────────
    let ogUrls:        string[] = [];
    let mapillaryUrls: string[] = [];
    let unsplashUrls:  string[] = [];

    // ── TIER 1: OG image from the restaurant's own website ────────────────
    console.log('[Tier 1] Fetching OG images...');
    if (website_url) {
      ogUrls = await fetchOgImages(website_url, 2);
    } else {
      console.log('[Tier 1] No website URL provided, skipping.');
    }
    console.log(`[Tier 1] Got ${ogUrls.length} OG URLs.`);

    const collectedSoFar = ogUrls.length;

    // ── TIER 2: Mapillary exterior shot ───────────────────────────────────
    console.log('[Tier 2] Fetching Mapillary images...');
    const mapillaryLimit = Math.max(0, TARGET_PHOTOS - collectedSoFar);
    if (mapillaryLimit > 0) {
      mapillaryUrls = await fetchMapillaryImages(latitude, longitude, mapillaryKey, mapillaryLimit);
    } else {
      console.log('[Tier 2] Already have enough photos, skipping Mapillary.');
    }
    console.log(`[Tier 2] Got ${mapillaryUrls.length} Mapillary URLs.`);

    const collectedAfterTier2 = ogUrls.length + mapillaryUrls.length;

    // ── TIER 3: Unsplash cuisine category ─────────────────────────────────
    console.log('[Tier 3] Fetching Unsplash images...');

    if (collectedAfterTier2 === 0) {
      // Both Tier 1 and 2 returned nothing → single random Unsplash fallback
      console.log('[Tier 3] Zero photos from Tiers 1+2 → fetching 1 Unsplash fallback.');
      unsplashUrls = await fetchUnsplashImages(cuisine_key || 'default', unsplashKey, 1);
    } else {
      const unsplashLimit = Math.max(0, TARGET_PHOTOS - collectedAfterTier2);
      if (unsplashLimit > 0) {
        unsplashUrls = await fetchUnsplashImages(cuisine_key || 'default', unsplashKey, unsplashLimit);
      } else {
        console.log('[Tier 3] Already have enough photos, skipping Unsplash.');
      }
    }
    console.log(`[Tier 3] Got ${unsplashUrls.length} Unsplash URLs.`);

    // ── Combine in priority order ──────────────────────────────────────────
    const photoUrls = [...ogUrls, ...mapillaryUrls, ...unsplashUrls];
    console.log(`[Done] Total photos collected: ${photoUrls.length} (OG: ${ogUrls.length}, Mapillary: ${mapillaryUrls.length}, Unsplash: ${unsplashUrls.length})`);

    // ── Cache to Supabase ─────────────────────────────────────────────────
    const { error: upsertError } = await supabase
      .from('restaurant_photo_cache')
      .upsert({
        google_place_id: place_id,
        og_urls:         ogUrls,
        mapillary_urls:  mapillaryUrls,
        unsplash_urls:   unsplashUrls,
        photo_urls:      photoUrls,
        cuisine_key:     cuisine_key ?? null,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'google_place_id' });

    if (upsertError) {
      console.error('[Supabase] Cache upsert failed:', upsertError);
    } else {
      console.log('[Supabase] Cache upsert successful.');
    }

    // ── Response ──────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        photo_urls:     photoUrls,
        og_urls:        ogUrls,
        mapillary_urls: mapillaryUrls,
        unsplash_urls:  unsplashUrls,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Global Error] Edge Function crashed:', error);

    // Cache the failure so we don't hammer the APIs again immediately
    if (requestPlaceId) {
      try {
        const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase           = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from('restaurant_photo_cache').upsert({
          google_place_id: requestPlaceId,
          og_urls:         [],
          mapillary_urls:  [],
          unsplash_urls:   [],
          photo_urls:      [],
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'google_place_id' });
      } catch (e) {
        console.error('[Supabase] Failed to cache empty result after crash:', e);
      }
    }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
