import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_OG_PHOTOS = 2;
const MAX_WIKIMEDIA_PHOTOS = 3;
const MAX_UNSPLASH_PHOTOS = 2;
const MAX_TOTAL_PHOTOS = 6;
const WIKIMEDIA_MIN_WIDTH = 400;
const WIKIMEDIA_THUMB_WIDTH = 1200;
const FETCH_USER_AGENT = 'Platebound/1.0 (restaurant-photo-fetcher; contact: support@platebound.app)';

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

type PhotoCacheUpsertRow = {
  google_place_id: string;
  og_urls: string[];
  unsplash_urls: string[];
  photo_urls: string[];
  cuisine_key: string | null;
  updated_at: string;
  wikimediaUrls: string[];
};

async function upsertPhotoCache(
  supabase: ReturnType<typeof createClient>,
  row: PhotoCacheUpsertRow,
): Promise<{ code?: string; message?: string } | null> {
  const base = {
    google_place_id: row.google_place_id,
    og_urls: row.og_urls,
    unsplash_urls: row.unsplash_urls,
    photo_urls: row.photo_urls,
    cuisine_key: row.cuisine_key,
    updated_at: row.updated_at,
  };

  const { error } = await supabase
    .from('restaurant_photo_cache')
    .upsert({ ...base, wikimedia_urls: row.wikimediaUrls }, { onConflict: 'google_place_id' });

  if (!error) return null;
  if (error.code !== '42703') return error;

  const { error: legacyError } = await supabase
    .from('restaurant_photo_cache')
    .upsert({ ...base, mapillary_urls: row.wikimediaUrls }, { onConflict: 'google_place_id' });

  return legacyError;
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || !trimmed.startsWith('http') || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function resolveAbsoluteUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).href;
  } catch {
    return maybeRelative;
  }
}

async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': FETCH_USER_AGENT,
        'Range': 'bytes=0-1023',
        'Accept': 'image/*,*/*',
      },
    });
    clearTimeout(timeout);

    if (!res.ok && res.status !== 206) return false;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

async function filterValidImageUrls(urls: string[]): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url) => ((await validateImageUrl(url)) ? url : null)),
  );
  const valid = results.filter((url): url is string => url !== null);
  for (const url of urls) {
    if (!valid.includes(url)) {
      console.log(`[Validate] Rejected non-image or unreachable URL: ${url.slice(0, 120)}`);
    }
  }
  return valid;
}

/**
 * Extracts the OG image from a restaurant's website by fetching its HTML.
 * Returns up to `limit` OG/twitter image URLs.
 */
async function fetchOgImages(websiteUrl: string, limit = 1): Promise<string[]> {
  if (!websiteUrl) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': FETCH_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();

    const urls: string[] = [];
    const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
    const metaRegex2 = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi;

    for (const regex of [metaRegex, metaRegex2]) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && urls.length < limit) {
        const raw = match[1].trim();
        const url = raw.startsWith('http')
          ? raw
          : resolveAbsoluteUrl(websiteUrl, raw);
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

function buildWikimediaSearchQueries(
  name: string,
  formattedAddress?: string,
  cuisineKey?: string,
): string[] {
  const queries: string[] = [];
  const trimmedName = name.trim();
  if (!trimmedName) return queries;

  const normalizedName = trimmedName.replace(/[''`]/g, '');
  const brandName = trimmedName.split(/\s[-–—|@]\s/)[0]?.trim() || trimmedName;

  let cityHint = '';
  if (formattedAddress) {
    const parts = formattedAddress.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      cityHint = parts[parts.length - 2] || parts[parts.length - 1];
    } else if (parts.length === 1) {
      cityHint = parts[0];
    }
  }

  if (cityHint) {
    queries.push(`${trimmedName} ${cityHint}`);
    queries.push(`${brandName} ${cityHint}`);
  }

  queries.push(trimmedName);
  if (normalizedName !== trimmedName) queries.push(normalizedName);
  queries.push(`${trimmedName} restaurant`);
  queries.push(`${brandName} restaurant`);

  if (cuisineKey && cuisineKey !== 'default') {
    queries.push(`${trimmedName} ${cuisineKey}`);
  }

  return [...new Set(queries)];
}

type WikimediaImageInfo = {
  url?: string;
  thumburl?: string;
  mime?: string;
  width?: number;
};

function pickWikimediaImageUrl(imageInfo: WikimediaImageInfo | undefined): string | null {
  if (!imageInfo) return null;

  const mime = imageInfo.mime ?? '';
  if (mime && !mime.startsWith('image/')) return null;
  if ((imageInfo.width ?? 0) < WIKIMEDIA_MIN_WIDTH) return null;

  const thumb = imageInfo.thumburl;
  const full = imageInfo.url;
  const url = (thumb && thumb.startsWith('http')) ? thumb : full;
  return url && url.startsWith('http') ? url : null;
}

/**
 * Searches Wikimedia Commons for a restaurant image using name and other details.
 * Returns up to `limit` hotlinkable image URLs (no download/storage required).
 */
async function fetchWikimediaImages(
  name: string,
  options: { formattedAddress?: string; cuisineKey?: string },
  limit = 1,
): Promise<string[]> {
  const queries = buildWikimediaSearchQueries(name, options.formattedAddress, options.cuisineKey);
  if (queries.length === 0) return [];

  const found: string[] = [];

  for (const searchTerm of queries) {
    if (found.length >= limit) break;

    try {
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      url.searchParams.set('action', 'query');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*');
      url.searchParams.set('generator', 'search');
      url.searchParams.set('gsrnamespace', '6');
      url.searchParams.set('gsrsearch', searchTerm);
      url.searchParams.set('gsrlimit', '8');
      url.searchParams.set('prop', 'imageinfo');
      url.searchParams.set('iiprop', 'url|mime|size');
      url.searchParams.set('iiurlwidth', String(WIKIMEDIA_THUMB_WIDTH));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': FETCH_USER_AGENT },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.log(`[Wikimedia] API error (${res.status}) for query "${searchTerm}"`);
        continue;
      }

      const data = await res.json();
      const pages = data?.query?.pages ?? {};

      for (const page of Object.values(pages) as Array<{ imageinfo?: WikimediaImageInfo[] }>) {
        const imageUrl = pickWikimediaImageUrl(page?.imageinfo?.[0]);
        if (imageUrl && !found.includes(imageUrl)) {
          found.push(imageUrl);
          if (found.length >= limit) break;
        }
      }
    } catch (err) {
      console.log(`[Wikimedia] Fetch failed for query "${searchTerm}":`, (err as Error).message);
    }
  }

  if (found.length === 0) {
    console.log(`[Wikimedia] No images found for "${name}"`);
  }

  return found.slice(0, limit);
}

/**
 * Fetches Unsplash photos for a cuisine category.
 * Returns up to `limit` image URLs (regular size ~1080px).
 */
async function fetchUnsplashImages(
  cuisineKey: string,
  apiKey: string,
  limit = 1
): Promise<string[]> {
  if (!apiKey) return [];
  const query = CUISINE_UNSPLASH_MAP[cuisineKey] ?? CUISINE_UNSPLASH_MAP.default;
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('client_id', apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(Math.min(limit * 2, 10)));
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
      formatted_address,
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

    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')?.trim() ?? '';
    if (!unsplashKey) console.warn('[Keys] UNSPLASH_ACCESS_KEY is not set — Unsplash fallback will be skipped.');

    const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase           = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Fetch] Running all photo tiers in parallel...');
    const [rawOgUrls, rawWikimediaUrls, rawUnsplashUrls] = await Promise.all([
      website_url
        ? fetchOgImages(website_url, MAX_OG_PHOTOS)
        : Promise.resolve([] as string[]),
      fetchWikimediaImages(name, {
        formattedAddress: formatted_address || undefined,
        cuisineKey: cuisine_key || undefined,
      }, MAX_WIKIMEDIA_PHOTOS),
      fetchUnsplashImages(cuisine_key || 'default', unsplashKey, MAX_UNSPLASH_PHOTOS),
    ]);

    console.log(`[Fetch] Raw counts — OG: ${rawOgUrls.length}, Wikimedia: ${rawWikimediaUrls.length}, Unsplash: ${rawUnsplashUrls.length}`);

    const [ogUrls, wikimediaUrls, unsplashUrls] = await Promise.all([
      filterValidImageUrls(rawOgUrls),
      filterValidImageUrls(rawWikimediaUrls),
      filterValidImageUrls(rawUnsplashUrls),
    ]);

    const photoUrls = dedupeUrls([
      ...ogUrls,
      ...wikimediaUrls,
      ...unsplashUrls,
    ]).slice(0, MAX_TOTAL_PHOTOS);

    console.log(`[Done] Validated photos: ${photoUrls.length} (OG: ${ogUrls.length}, Wikimedia: ${wikimediaUrls.length}, Unsplash: ${unsplashUrls.length})`);

    const upsertError = await upsertPhotoCache(supabase, {
      google_place_id: place_id,
      og_urls:         ogUrls,
      unsplash_urls:   unsplashUrls,
      photo_urls:      photoUrls,
      cuisine_key:     cuisine_key ?? null,
      updated_at:      new Date().toISOString(),
      wikimediaUrls,
    });

    if (upsertError) {
      console.error('[Supabase] Cache upsert failed:', upsertError);
    } else {
      console.log('[Supabase] Cache upsert successful.');
    }

    return new Response(
      JSON.stringify({
        photo_urls:     photoUrls,
        og_urls:        ogUrls,
        wikimedia_urls: wikimediaUrls,
        unsplash_urls:  unsplashUrls,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Global Error] Edge Function crashed:', error);

    if (requestPlaceId) {
      try {
        const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase           = createClient(supabaseUrl, supabaseServiceKey);
        await upsertPhotoCache(supabase, {
          google_place_id: requestPlaceId,
          og_urls:         [],
          unsplash_urls:   [],
          photo_urls:      [],
          cuisine_key:     null,
          updated_at:      new Date().toISOString(),
          wikimediaUrls:   [],
        });
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
