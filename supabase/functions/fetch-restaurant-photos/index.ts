import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_OG_PHOTOS = 3;
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
 * Scrapes a restaurant's website for images.
 * Looks for OG images first, then standard <img> tags.
 * If < limit images found, it attempts to find a /menu link and scrape that too.
 */
async function scrapeWebsiteImages(websiteUrl: string, limit = 3): Promise<string[]> {
  if (!websiteUrl) return [];
  const urls: string[] = [];

  const extractImagesFromHtml = (html: string, baseUrl: string) => {
    // 1. OG Images
    const metaRegexes = [
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi
    ];
    for (const regex of metaRegexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && urls.length < limit) {
        const raw = match[1].trim();
        const url = raw.startsWith('http') ? raw : resolveAbsoluteUrl(baseUrl, raw);
        if (url.startsWith('http') && !urls.includes(url)) urls.push(url);
      }
    }

    // 2. Standard <img> tags
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(html)) !== null && urls.length < limit) {
      const raw = imgMatch[1].trim();
      // Ignore tiny icons, svgs, or obvious UI elements
      if (raw.endsWith('.svg') || raw.endsWith('.gif') || raw.includes('logo') || raw.includes('icon') || raw.includes('spinner')) continue;
      
      const url = raw.startsWith('http') ? raw : resolveAbsoluteUrl(baseUrl, raw);
      if (url.startsWith('http') && !urls.includes(url)) urls.push(url);
    }
  };

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

    if (!res.ok) return urls;
    const html = await res.text();
    extractImagesFromHtml(html, websiteUrl);

    // If we don't have enough images, search for a menu/gallery endpoint
    if (urls.length < limit) {
      const menuLinkRegex = /<a[^>]+href=["']([^"']*(?:menu|gallery|photos|food)[^"']*)["'][^>]*>/i;
      const menuMatch = menuLinkRegex.exec(html);
      if (menuMatch) {
        let menuUrl = menuMatch[1].trim();
        if (!menuUrl.startsWith('http')) menuUrl = resolveAbsoluteUrl(websiteUrl, menuUrl);
        
        try {
          const mController = new AbortController();
          const mTimeout = setTimeout(() => mController.abort(), 5000);
          const mRes = await fetch(menuUrl, {
            signal: mController.signal,
            headers: { 'User-Agent': FETCH_USER_AGENT, 'Accept': 'text/html' },
          });
          clearTimeout(mTimeout);
          if (mRes.ok) {
            const mHtml = await mRes.text();
            extractImagesFromHtml(mHtml, menuUrl);
          }
        } catch (e) {
          // ignore sub-scrape errors
        }
      }
    }

    console.log(`[Scrape] Found ${urls.length} images from ${websiteUrl}`);
    return urls;
  } catch (err) {
    console.log(`[Scrape] Failed to scrape ${websiteUrl}:`, (err as Error).message);
    return urls;
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

  // Force generic queries to include restaurant or dining to avoid landscapes
  if (cityHint) {
    queries.push(`${trimmedName} ${cityHint} restaurant`);
    queries.push(`${brandName} ${cityHint} restaurant`);
  }

  queries.push(`${trimmedName} restaurant`);
  queries.push(`${brandName} restaurant`);
  queries.push(`${trimmedName} dining`);

  if (cuisineKey && cuisineKey !== 'default') {
    queries.push(`${trimmedName} ${cuisineKey} restaurant`);
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

    console.log('[Fetch] Trying website scrape first...');
    const rawOgUrls = website_url
      ? await scrapeWebsiteImages(website_url, MAX_OG_PHOTOS)
      : [];

    const ogUrls = await filterValidImageUrls(rawOgUrls);

    let wikimediaUrls: string[] = [];
    let unsplashUrls: string[] = [];

    // Fallback strictly ONLY if we have 0 photos
    if (ogUrls.length === 0) {
      console.log('[Fetch] No website images found. Falling back to Wikimedia and Unsplash.');
      const [rawWikimediaUrls, rawUnsplashUrls] = await Promise.all([
        fetchWikimediaImages(name, {
          formattedAddress: formatted_address || undefined,
          cuisineKey: cuisine_key || undefined,
        }, MAX_WIKIMEDIA_PHOTOS),
        fetchUnsplashImages(cuisine_key || 'default', unsplashKey, MAX_UNSPLASH_PHOTOS),
      ]);
      wikimediaUrls = await filterValidImageUrls(rawWikimediaUrls);
      unsplashUrls = await filterValidImageUrls(rawUnsplashUrls);
    } else {
      console.log(`[Fetch] Found ${ogUrls.length} website images. Skipping fallbacks.`);
    }

    const photoUrls = dedupeUrls([
      ...ogUrls,
      ...wikimediaUrls,
      ...unsplashUrls,
    ]).slice(0, MAX_TOTAL_PHOTOS);

    console.log(`[Done] Validated photos: ${photoUrls.length} (OG/Web: ${ogUrls.length}, Wikimedia: ${wikimediaUrls.length}, Unsplash: ${unsplashUrls.length})`);

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
