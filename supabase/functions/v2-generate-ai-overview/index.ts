import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const FETCH_USER_AGENT = 'Platebound/2.0 (v2-ai-overview; contact: support@platebound.app)';
const MENU_KEYWORDS = ['menu', 'food', 'drink', 'dining', 'eat'];
const MAX_TEXT_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 7000;

// ─── Types ────────────────────────────────────────────────────────────────────

type InputPlace = {
  gers_id: string;
  name: string;
  website_url?: string | null;
  address?: string | null;
  city?: string | null;
  category?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  phone?: string | null;
};

type AiOverview = {
  summaryGoodBad: string;
  speedScore: number;
  healthScore: number;
  workoutRecoveryScore: number;
  processedScore: number;
  calorieScore: number;
  proteinScore: number;
  carbScore: number;
  dateWorthiness: number;
  noiseLevelEstimate: number;
  groupSizeSweetSpot: number;
  absoluteMacros: string;
  whoThisPlaceIsFor: string;
  tasteScore: number;
  valueForMoneyScore: number;
  hungoverRecoveryScore: number;
  munchyScore: number;
  varietyScore: number;
  macroFriendlyScore: number;
  soloDinerScore: number;
  energySustainScore: number;
  workFriendlyScore: number;
  // Unified menu + pricing (merged from generate-ai-menus)
  topMenuItems: Array<{ name: string; price: string; overview: string }>;
  priceTier: number;
  cuisineKey: string;
};

// ─── Gemini JSON Schema ───────────────────────────────────────────────────────

const overviewItemSchema = {
  type: 'OBJECT',
  properties: {
    gersId: { type: 'STRING' },
    summaryGoodBad: { type: 'STRING' },
    speedScore: { type: 'INTEGER' },
    healthScore: { type: 'NUMBER' },
    workoutRecoveryScore: { type: 'INTEGER' },
    processedScore: { type: 'INTEGER' },
    calorieScore: { type: 'INTEGER' },
    proteinScore: { type: 'INTEGER' },
    carbScore: { type: 'INTEGER' },
    dateWorthiness: { type: 'INTEGER' },
    noiseLevelEstimate: { type: 'INTEGER' },
    groupSizeSweetSpot: { type: 'INTEGER' },
    absoluteMacros: { type: 'STRING' },
    whoThisPlaceIsFor: { type: 'STRING' },
    tasteScore: { type: 'INTEGER' },
    valueForMoneyScore: { type: 'INTEGER' },
    hungoverRecoveryScore: { type: 'INTEGER' },
    munchyScore: { type: 'INTEGER' },
    varietyScore: { type: 'INTEGER' },
    macroFriendlyScore: { type: 'INTEGER' },
    soloDinerScore: { type: 'INTEGER' },
    energySustainScore: { type: 'INTEGER' },
    workFriendlyScore: { type: 'INTEGER' },
    topMenuItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          price: { type: 'STRING' },
          overview: { type: 'STRING' },
        },
        required: ['name', 'price', 'overview'],
      },
    },
    priceTier: { type: 'INTEGER' },
    cuisineKey: { type: 'STRING' },
  },
  required: [
    'gersId', 'summaryGoodBad', 'speedScore', 'healthScore', 'workoutRecoveryScore',
    'processedScore', 'calorieScore', 'proteinScore', 'carbScore', 'dateWorthiness',
    'noiseLevelEstimate', 'groupSizeSweetSpot', 'absoluteMacros', 'whoThisPlaceIsFor',
    'tasteScore', 'valueForMoneyScore', 'hungoverRecoveryScore', 'munchyScore',
    'varietyScore', 'macroFriendlyScore', 'soloDinerScore', 'energySustainScore',
    'workFriendlyScore', 'topMenuItems', 'priceTier', 'cuisineKey',
  ],
} as const;

const batchResponseSchema = {
  type: 'OBJECT',
  properties: {
    overviews: { type: 'ARRAY', items: overviewItemSchema },
  },
  required: ['overviews'],
} as const;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are generating restaurant AI overviews for Platebound, a restaurant discovery app.
You will receive up to 5 restaurants per call, each with optional scraped website/menu text.
Return JSON only at the root: an object with a single key "overviews" whose value is an array.
The array must contain exactly one object per restaurant provided, in the same order.
Each object must have "gersId" matching that restaurant's GERS ID and all required fields.

SCORE RULES:
1) summaryGoodBad: concise balanced pros and cons, max 320 chars. No marketing fluff.
2) speedScore: integer 0-5 (0=slowest, 5=fastest counter-service).
3) healthScore: decimal 0-10 (10=healthiest), one decimal place.
4) workoutRecoveryScore: integer 0-10 (10=best for gym recovery).
5) processedScore: integer 0-10 (10=least processed ingredients).
6) calorieScore: integer 0-5 (5=most calorie-dense typical order).
7) proteinScore: integer 0-5 (5=highest protein typical order).
8) carbScore: integer 0-5 (5=highest carb typical order).
9) dateWorthiness: integer 0-5 (5=excellent date spot).
10) noiseLevelEstimate: integer 0-5 (5=very loud).
11) groupSizeSweetSpot: integer 1-6 (ideal party size).
12) absoluteMacros: estimated calories/protein/carbs/fat for a typical order with AI uncertainty caveat.
13) whoThisPlaceIsFor: single concise string describing the target customer.
14) tasteScore: integer 0-5 (5=best flavor execution for this concept).
15) valueForMoneyScore: integer 0-5 (5=best value, weigh price vs. portion/quality).
16) hungoverRecoveryScore: integer 0-5 (5=best for hangover recovery).
17) munchyScore: integer 0-5 (5=most satisfying late-night craving).
18) varietyScore: integer 0-5 (5=broadest menu variety).
19) macroFriendlyScore: integer 0-5 (5=easiest to track macros/calories).
20) soloDinerScore: integer 0-5 (5=most welcoming for solo dining).
21) energySustainScore: integer 0-5 (5=slow sustained fullness, 0=spike and crash).
22) workFriendlyScore: integer 0-5 (5=best for laptop work — wifi/seating vibe).

MENU EXTRACTION (from website text if provided):
23) topMenuItems: array of up to 4 signature dishes found in the website text.
    Each item: name (exact as on menu), price (exact printed price like "$18.00" or "" if unknown), overview (1-sentence description).
    CRITICAL: If no actual food items found in website text, return empty array []. DO NOT hallucinate dishes.
    If website text is empty/unavailable, infer 2-3 typical dishes for this category/cuisine as placeholders (mark price as "").
24) priceTier: integer 1-4 (1=budget <$15/person, 2=moderate $15-30, 3=pricey $30-60, 4=fine dining $60+).
    Infer from website text prices if available, else from category and location context.
25) cuisineKey: single lowercase string from: italian, mexican, american, japanese, chinese, thai, indian,
    mediterranean, korean, vietnamese, french, greek, middle_eastern, caribbean, african, latin,
    cafe, bar, pizza, burger, sandwich, seafood, steak, sushi, ramen, bbq, vegan, vegetarian,
    dessert, bakery, fast_food, breakfast, brunch, or "general" if unclear.

IMPORTANT: Use website menu text as primary signal for menu items and pricing. Fall back to category-level knowledge when text is absent. Keep uncertainty explicit.`;

// ─── Website Scraper (1-Depth) ─────────────────────────────────────────────────

function extractTextFromHtml(html: string): string {
  // Strip scripts, styles, nav, and footer which are noise
  const noScript = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  const noStyle = noScript.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  const noNav = noStyle.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');
  const noFooter = noNav.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  const stripped = noFooter.replace(/<[^>]+>/g, ' ');
  return stripped.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const html = await res.text();
    return extractTextFromHtml(html);
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function scrapeWebsite(websiteUrl: string): Promise<string> {
  if (!websiteUrl) return '';

  // Fetch 1: Home page
  let homeText = '';
  let homeHtml = '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': FETCH_USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      homeHtml = await res.text();
      homeText = extractTextFromHtml(homeHtml);
    }
  } catch {
    clearTimeout(timer);
    return '';
  }

  // Fetch 2 (1-depth): Scan home page <a> tags for menu keywords
  // Only one additional fetch maximum
  const menuLinkRegex = new RegExp(
    `href=["']([^"']*(?:${MENU_KEYWORDS.join('|')})[^"']*)["']`,
    'i'
  );
  const match = menuLinkRegex.exec(homeHtml);
  let menuText = '';

  if (match?.[1]) {
    let menuUrl = match[1].trim();
    // Resolve relative URLs
    try {
      if (!menuUrl.startsWith('http')) {
        menuUrl = new URL(menuUrl, websiteUrl).href;
      }
      // Only fetch if it's a different URL than the home page
      if (menuUrl !== websiteUrl && menuUrl !== websiteUrl + '/') {
        menuText = await fetchWithTimeout(menuUrl, 6000);
      }
    } catch {
      // ignore invalid URL
    }
  }

  const combined = [homeText, menuText].filter(Boolean).join(' ').slice(0, MAX_TEXT_CHARS);
  return combined;
}

// ─── Place Text Block Builder ─────────────────────────────────────────────────

function buildPlaceBlock(place: InputPlace, websiteText: string): string {
  return [
    `GERS ID: ${place.gers_id}`,
    `Name: ${place.name}`,
    `Category: ${place.category || 'restaurant'}`,
    `Address: ${[place.address, place.city].filter(Boolean).join(', ') || 'Unknown'}`,
    `Phone: ${place.phone || 'Not available'}`,
    `Website: ${place.website_url || 'None'}`,
    `Lat/Lng: ${place.location?.latitude?.toFixed(5) ?? ''}, ${place.location?.longitude?.toFixed(5) ?? ''}`,
    `---`,
    `Website / Menu Text (${websiteText.length} chars):`,
    websiteText.length > 50 ? websiteText.slice(0, 8000) : '(no website text available)',
  ].join('\n');
}

function buildBatchPrompt(
  batch: InputPlace[],
  texts: string[]
): string {
  const blocks = batch.map((p, i) =>
    `=== Restaurant ${i + 1} ===\n${buildPlaceBlock(p, texts[i] || '')}`
  ).join('\n\n');

  return `You are given exactly ${batch.length} restaurant(s). Return one JSON object with key "overviews" containing an array of exactly ${batch.length} objects (same order). Each must include "gersId" matching the restaurant's GERS ID and all required score fields.

${blocks}`;
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

function sanitizeOverview(raw: any): AiOverview | null {
  if (!raw || typeof raw !== 'object') return null;

  const toInt = (v: any, fallback = 0) => {
    const n = Number.parseInt(String(v), 10);
    return Number.isNaN(n) ? fallback : n;
  };
  const toFloat = (v: any) => {
    const n = Number.parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
  };
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const summaryGoodBad = String(raw.summaryGoodBad ?? '').trim().slice(0, 400);
  const absoluteMacros = String(raw.absoluteMacros ?? '').trim();
  const whoThisPlaceIsFor = String(raw.whoThisPlaceIsFor ?? '').trim();
  if (!summaryGoodBad || !absoluteMacros || !whoThisPlaceIsFor) return null;

  // Sanitize menu items
  const rawItems = Array.isArray(raw.topMenuItems) ? raw.topMenuItems : [];
  const topMenuItems = rawItems.slice(0, 4).map((item: any) => ({
    name: String(item?.name ?? '').trim().slice(0, 100),
    price: String(item?.price ?? '').trim().slice(0, 20),
    overview: String(item?.overview ?? '').trim().slice(0, 200),
  })).filter((item: { name: string }) => item.name.length > 0);

  const priceTier = clamp(toInt(raw.priceTier, 2), 1, 4);

  // Validate cuisine key
  const validCuisineKeys = new Set([
    'italian', 'mexican', 'american', 'japanese', 'chinese', 'thai', 'indian',
    'mediterranean', 'korean', 'vietnamese', 'french', 'greek', 'middle_eastern',
    'caribbean', 'african', 'latin', 'cafe', 'bar', 'pizza', 'burger', 'sandwich',
    'seafood', 'steak', 'sushi', 'ramen', 'bbq', 'vegan', 'vegetarian',
    'dessert', 'bakery', 'fast_food', 'breakfast', 'brunch', 'general',
  ]);
  const cuisineKeyRaw = String(raw.cuisineKey ?? 'general').toLowerCase().trim();
  const cuisineKey = validCuisineKeys.has(cuisineKeyRaw) ? cuisineKeyRaw : 'general';

  return {
    summaryGoodBad,
    speedScore: clamp(toInt(raw.speedScore), 0, 5),
    healthScore: Number(clamp(toFloat(raw.healthScore), 0, 10).toFixed(1)),
    workoutRecoveryScore: clamp(toInt(raw.workoutRecoveryScore), 0, 10),
    processedScore: clamp(toInt(raw.processedScore), 0, 10),
    calorieScore: clamp(toInt(raw.calorieScore), 0, 5),
    proteinScore: clamp(toInt(raw.proteinScore), 0, 5),
    carbScore: clamp(toInt(raw.carbScore), 0, 5),
    dateWorthiness: clamp(toInt(raw.dateWorthiness), 0, 5),
    noiseLevelEstimate: clamp(toInt(raw.noiseLevelEstimate), 0, 5),
    groupSizeSweetSpot: clamp(toInt(raw.groupSizeSweetSpot, 2), 1, 6),
    absoluteMacros,
    whoThisPlaceIsFor,
    tasteScore: clamp(toInt(raw.tasteScore), 0, 5),
    valueForMoneyScore: clamp(toInt(raw.valueForMoneyScore), 0, 5),
    hungoverRecoveryScore: clamp(toInt(raw.hungoverRecoveryScore), 0, 5),
    munchyScore: clamp(toInt(raw.munchyScore), 0, 5),
    varietyScore: clamp(toInt(raw.varietyScore), 0, 5),
    macroFriendlyScore: clamp(toInt(raw.macroFriendlyScore), 0, 5),
    soloDinerScore: clamp(toInt(raw.soloDinerScore), 0, 5),
    energySustainScore: clamp(toInt(raw.energySustainScore), 0, 5),
    workFriendlyScore: clamp(toInt(raw.workFriendlyScore), 0, 5),
    topMenuItems,
    priceTier,
    cuisineKey,
  };
}

// ─── Gemini Batch Call ────────────────────────────────────────────────────────

async function runGeminiBatch(
  batch: InputPlace[],
  websiteTexts: string[],
  geminiUrl: string
): Promise<{ gersId: string; overview: AiOverview }[]> {
  const batchIds = new Set(batch.map(p => p.gers_id));
  const out: { gersId: string; overview: AiOverview }[] = [];

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildBatchPrompt(batch, websiteTexts) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: batchResponseSchema,
      },
    }),
  });

  if (!response.ok) {
    console.error(`[v2-generate-ai-overview] Gemini API error: ${response.status}`);
    return out;
  }

  const modelData = await response.json();
  const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('[v2-generate-ai-overview] Gemini returned empty response');
    return out;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error('[v2-generate-ai-overview] Failed to parse Gemini JSON');
    return out;
  }

  const items = parsed?.overviews;
  if (!Array.isArray(items)) return out;

  for (const item of items) {
    const gersId = String(item?.gersId ?? '').trim();
    if (!gersId || !batchIds.has(gersId)) continue;

    const overview = sanitizeOverview(item);
    if (!overview) continue;

    out.push({ gersId, overview });
  }

  return out;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { places } = await req.json();
    if (!places || !Array.isArray(places)) {
      return new Response(JSON.stringify({ error: 'places array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY missing');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const validPlaces = (places as InputPlace[]).filter(p => p?.gers_id);

    // ── Step 1: Check which GERS IDs are already cached ───────────────────────
    const gersIds = validPlaces.map(p => p.gers_id);
    const { data: cachedRows, error: cacheReadError } = await supabase
      .from('v2_ai_overview_cache')
      .select('gers_id')
      .in('gers_id', gersIds);

    if (cacheReadError) {
      console.warn(`[v2-generate-ai-overview] Supabase cache read error: ${cacheReadError.message}`);
    }

    const cachedIds = new Set((cachedRows ?? []).map((r: { gers_id: string }) => r.gers_id));
    console.log(`[v2-generate-ai-overview] Supabase v2 AI cache: ${cachedIds.size} / ${gersIds.length} already cached`);

    const uncachedPlaces = validPlaces.filter(p => !cachedIds.has(p.gers_id));
    if (uncachedPlaces.length === 0) {
      console.log('[v2-generate-ai-overview] All places already cached, nothing to generate');
      return new Response(JSON.stringify({ generatedOverviews: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Step 2: Scrape websites in parallel (1-depth, timeout-bounded) ────────
    console.log(`[v2-generate-ai-overview] Scraping websites for ${uncachedPlaces.length} places...`);
    const websiteTexts = await Promise.all(
      uncachedPlaces.map(p =>
        p.website_url ? scrapeWebsite(p.website_url) : Promise.resolve('')
      )
    );
    const scrapedCount = websiteTexts.filter(t => t.length > 50).length;
    console.log(`[v2-generate-ai-overview] Website scraping done: ${scrapedCount} / ${uncachedPlaces.length} had usable text`);

    // ── Step 3: Batch into groups of 5 and call Gemini ────────────────────────
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const batches: { places: InputPlace[]; texts: string[] }[] = [];
    for (let i = 0; i < uncachedPlaces.length; i += BATCH_SIZE) {
      batches.push({
        places: uncachedPlaces.slice(i, i + BATCH_SIZE),
        texts: websiteTexts.slice(i, i + BATCH_SIZE),
      });
    }

    console.log(`[v2-generate-ai-overview] Running ${batches.length} Gemini batch(es) of up to ${BATCH_SIZE}...`);
    const perBatch = await Promise.all(
      batches.map(b => runGeminiBatch(b.places, b.texts, geminiUrl))
    );
    const generatedOverviews = perBatch.flat();
    console.log(`[v2-generate-ai-overview] Gemini generated ${generatedOverviews.length} overviews`);

    // ── Step 4: Upsert to v2_ai_overview_cache ────────────────────────────────
    const updatedAt = new Date().toISOString();
    const placeMap = new Map(uncachedPlaces.map(p => [p.gers_id, p]));

    if (generatedOverviews.length > 0) {
      await Promise.all(
        generatedOverviews.map(({ gersId, overview }) => {
          const place = placeMap.get(gersId);
          return supabase.from('v2_ai_overview_cache').upsert({
            gers_id: gersId,
            summary_good_bad: overview.summaryGoodBad,
            speed_score: overview.speedScore,
            health_score: overview.healthScore,
            workout_recovery_score: overview.workoutRecoveryScore,
            processed_score: overview.processedScore,
            calorie_score: overview.calorieScore,
            protein_score: overview.proteinScore,
            carb_score: overview.carbScore,
            date_worthiness: overview.dateWorthiness,
            noise_level_estimate: overview.noiseLevelEstimate,
            group_size_sweet_spot: overview.groupSizeSweetSpot,
            absolute_macros: overview.absoluteMacros,
            who_this_place_is_for: overview.whoThisPlaceIsFor,
            taste_score: overview.tasteScore,
            value_for_money_score: overview.valueForMoneyScore,
            hungover_recovery_score: overview.hungoverRecoveryScore,
            munchy_score: overview.munchyScore,
            variety_score: overview.varietyScore,
            macro_friendly_score: overview.macroFriendlyScore,
            solo_diner_score: overview.soloDinerScore,
            energy_sustain_score: overview.energySustainScore,
            work_friendly_score: overview.workFriendlyScore,
            top_menu_items: overview.topMenuItems,
            price_tier: overview.priceTier,
            cuisine_key: overview.cuisineKey,
            website_url: place?.website_url ?? null,
            updated_at: updatedAt,
          }, { onConflict: 'gers_id' });
        })
      );
      console.log(`[v2-generate-ai-overview] Supabase upsert complete: ${generatedOverviews.length} rows written to v2_ai_overview_cache`);
    }

    return new Response(JSON.stringify({ generatedOverviews }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[v2-generate-ai-overview] Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
