import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import {
  hoursTextLooksParseable,
  isDeadTransportError,
  mapPool,
  pingWebsite,
  scrapeWebsite,
  type ScrapeResult,
} from "../_shared/websiteScrape.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 15;
const MAX_PLACES_PER_REQUEST = 60;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const PING_CONCURRENCY = 40;
const MAX_ATTR_CHARS = 700;
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const MENU_SIGNAL_RE = /\$\d{1,3}(?:\.\d{2})?|\b\d{1,2}\.\d{2}\b|\b\d{1,3}\s*(?:USD|usd)\b/i;

// Only map/OSM facts that affect cuisine, diet, vibe, or price scoring.
const ATTR_KEEP_RE =
  /^(Brand|Basic category|Category primary|Category alternate|Taxonomy primary|Taxonomy alternate|Price range raw|OSM tags):/i;
const OSM_TAG_KEEP_RE =
  /\b(cuisine|diet|organic|vegan|vegetarian|halal|kosher|gluten|outdoor|takeaway|delivery|drive.?through|wifi|internet|wheelchair|breakfast|brunch|lunch|dinner|bar|pub|cafe|coffee|fast.?food|seafood|steak|pizza|burger|ramen|sushi|bbq|barbecue|microbrewery|craft.?beer|wine|cocktails?|reservation|capacity|smoking|air.?conditioning)\b/i;

// ─── Types ────────────────────────────────────────────────────────────────────

type InputPlace = {
  gers_id: string;
  name: string;
  website_url?: string | null;
  category?: string | null;
  price_tier?: number | null;
  regular_opening_hours?: { weekdayDescriptions: string[] } | null;
  attributes?: string[] | null;
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
  weekdayDescriptions: string[];
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
    priceTier: { type: 'INTEGER' },
    cuisineKey: { type: 'STRING' },
    weekdayDescriptions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'gersId', 'summaryGoodBad', 'speedScore', 'healthScore', 'workoutRecoveryScore',
    'processedScore', 'calorieScore', 'proteinScore', 'carbScore', 'dateWorthiness',
    'noiseLevelEstimate', 'groupSizeSweetSpot', 'absoluteMacros', 'whoThisPlaceIsFor',
    'tasteScore', 'valueForMoneyScore', 'hungoverRecoveryScore', 'munchyScore',
    'varietyScore', 'macroFriendlyScore', 'soloDinerScore', 'energySustainScore',
    'workFriendlyScore', 'priceTier', 'cuisineKey',
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

const SYSTEM_INSTRUCTION = `Score restaurants for Platebound. Return JSON only: {"overviews":[...]} with exactly one object per input restaurant, same order. Each object needs gersId plus the score fields listed in the schema.

Scores (integers unless noted):
- summaryGoodBad: pros/cons, max 180 chars
- speedScore 0-5, healthScore 0-10 (1 decimal), workoutRecoveryScore 0-10, processedScore 0-10 (10=least processed)
- calorieScore/proteinScore/carbScore 0-5, dateWorthiness 0-5, noiseLevelEstimate 0-5 (5=loud), groupSizeSweetSpot 1-6
- absoluteMacros: short typical-order estimate + uncertainty, max 100 chars
- whoThisPlaceIsFor: max 80 chars
- tasteScore/valueForMoneyScore/hungoverRecoveryScore/munchyScore/varietyScore/macroFriendlyScore/soloDinerScore/energySustainScore/workFriendlyScore: 0-5
- priceTier 1-4 (1=budget … 4=fine dining); prefer menu prices / price hint over guessing
- cuisineKey: one of italian,mexican,american,japanese,chinese,thai,indian,mediterranean,korean,vietnamese,french,greek,middle_eastern,caribbean,african,latin,cafe,bar,pizza,burger,sandwich,seafood,steak,sushi,ramen,bbq,vegan,vegetarian,dessert,bakery,fast_food,breakfast,brunch,general

Use only provided facts (category, brand/cuisine tags, menu snippet, hours text when present). Do not invent menu items or hours.

Hours:
- If a place includes "Hours text", parse it into weekdayDescriptions: exactly 7 strings, Monday through Sunday, each like "Monday: 11:00 AM – 10:00 PM" or "Monday: Closed". Expand "daily" / "every day" across all 7 days. If the text is incomplete for some days, use "Hours not listed" for those days only.
- If there is no Hours text, omit weekdayDescriptions (or return []). Never invent hours from category, brand, or typical restaurant schedules.`;

// ─── Website Scraper (1-Depth) ─────────────────────────────────────────────────

function buildPlaceBlock(place: InputPlace, scrape?: ScrapeResult): string {
  const lines = [
    `GERS ID: ${place.gers_id}`,
    `Name: ${place.name}`,
    `Category: ${place.category || 'restaurant'}`,
  ];
  if (place.price_tier != null) lines.push(`Price tier hint: ${place.price_tier}`);
  const attrs = selectRelevantAttributes(place.attributes);
  if (attrs.length > 0) {
    lines.push(`Map facts:\n${attrs.join('\n')}`);
  }
  if (scrape?.menuText && scrape.menuText.length > 40) {
    lines.push(`Menu snippet:\n${scrape.menuText}`);
  }
  const hasJsonLdHours = (scrape?.jsonLdWeekdayDescriptions?.length ?? 0) === 7;
  const hasOsmHours = (place.regular_opening_hours?.weekdayDescriptions?.length ?? 0) === 7;
  if (
    !hasJsonLdHours &&
    !hasOsmHours &&
    scrape?.hoursText &&
    hoursTextLooksParseable(scrape.hoursText)
  ) {
    lines.push(`Hours text:\n${scrape.hoursText}`);
  }
  return lines.join('\n');
}

function buildBatchPrompt(batch: InputPlace[], scrapeByGersId: Map<string, ScrapeResult>): string {
  const blocks = batch.map((p, i) =>
    `=== ${i + 1} ===\n${buildPlaceBlock(p, scrapeByGersId.get(p.gers_id))}`
  ).join('\n\n');

  return `Score these ${batch.length} restaurant(s). Return {"overviews":[...]} with ${batch.length} objects in the same order.\n\n${blocks}`;
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

function sanitizeWeekdayDescriptions(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length !== 7) return [];
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const text = String(raw[i] ?? '').trim();
    if (!text) return [];
    const prefix = `${WEEKDAY_NAMES[i]}:`;
    if (text.toLowerCase().startsWith(WEEKDAY_NAMES[i].toLowerCase())) {
      lines.push(text.slice(0, 120));
    } else {
      lines.push(`${prefix} ${text.replace(/^[^:]+:\s*/, '').slice(0, 100)}`);
    }
  }
  return lines;
}

function sanitizeOverview(
  raw: any,
  priceTierHint?: number | null,
  weekdayDescriptions: string[] = [],
  menuPriceTier: number | null = null,
): AiOverview | null {
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

  const summaryGoodBad = String(raw.summaryGoodBad ?? '').trim().slice(0, 200);
  const absoluteMacros = String(raw.absoluteMacros ?? '').trim().slice(0, 120);
  const whoThisPlaceIsFor = String(raw.whoThisPlaceIsFor ?? '').trim().slice(0, 100);
  if (!summaryGoodBad || !absoluteMacros || !whoThisPlaceIsFor) return null;

  const modelPriceTier = toInt(
    raw.priceTier,
    typeof priceTierHint === 'number' ? priceTierHint : 2,
  );
  const priceTier = clamp(menuPriceTier ?? modelPriceTier, 1, 4);

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
    topMenuItems: [],
    priceTier,
    cuisineKey,
    weekdayDescriptions: weekdayDescriptions.length === 7 ? weekdayDescriptions : [],
  };
}

async function runGeminiBatch(
  batch: InputPlace[],
  geminiUrl: string,
  scrapeByGersId: Map<string, ScrapeResult>,
): Promise<{ overviews: { gersId: string; overview: AiOverview }[] }> {
  const out: { gersId: string; overview: AiOverview }[] = [];

  const batchIds = new Set(batch.map(p => p.gers_id));

  if (batch.length === 0) {
    return { overviews: out };
  }

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildBatchPrompt(batch, scrapeByGersId) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 6144,
        responseMimeType: 'application/json',
        responseSchema: batchResponseSchema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    console.error(`[v2-generate-ai-overview] Gemini API error: ${response.status}`);
    return { overviews: out };
  }

  const modelData = await response.json();
  const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('[v2-generate-ai-overview] Gemini returned empty response');
    return { overviews: out };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error('[v2-generate-ai-overview] Failed to parse Gemini JSON');
    return { overviews: out };
  }

  const items = parsed?.overviews;
  if (!Array.isArray(items)) return { overviews: out };

  for (const item of items) {
    const gersId = String(item?.gersId ?? '').trim();
    if (!gersId || !batchIds.has(gersId)) continue;

    const place = batch.find(p => p.gers_id === gersId);
    const scraped = scrapeByGersId.get(gersId);
    const jsonLdHours = scraped?.jsonLdWeekdayDescriptions?.length === 7
      ? scraped.jsonLdWeekdayDescriptions
      : [];
    const osmHours = place?.regular_opening_hours?.weekdayDescriptions?.length === 7
      ? place.regular_opening_hours.weekdayDescriptions
      : [];
    const allowGeminiHours =
      jsonLdHours.length === 0 &&
      osmHours.length === 0 &&
      !!scraped?.hoursText &&
      hoursTextLooksParseable(scraped.hoursText);
    const geminiHours = allowGeminiHours
      ? sanitizeWeekdayDescriptions(item?.weekdayDescriptions)
      : [];
    const weekdayDescriptions =
      jsonLdHours.length === 7
        ? jsonLdHours
        : osmHours.length === 7
          ? osmHours
          : geminiHours;
    const menuPriceTier = scraped?.menuText
      ? inferPriceTierFromMenuText(scraped.menuText)
      : null;
    const overview = sanitizeOverview(
      item,
      place?.price_tier ?? null,
      weekdayDescriptions,
      menuPriceTier,
    );
    if (!overview) continue;

    out.push({ gersId, overview });
  }

  return { overviews: out };
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

    const validPlaces = (places as InputPlace[])
      .filter(p => p?.gers_id)
      .slice(0, MAX_PLACES_PER_REQUEST);

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

    // Skip temporarily_closed places — they still appear in the app but won't get AI overviews.
    const uncachedPlaces = validPlaces.filter(
      p => !cachedIds.has(p.gers_id)
    );
    if (uncachedPlaces.length === 0) {
      console.log('[v2-generate-ai-overview] All places already cached, nothing to generate');
      return new Response(JSON.stringify({ generatedOverviews: [], excludedPlaceIds: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    // ── Step 2: Load website scrape cache (warm cell scrapes) ─────────────────
    const scrapeByGersId = new Map<string, ScrapeResult>();
    const excludedPlaceIds: string[] = [];
    const { data: scrapeRows } = await supabase
      .from('v2_website_scrape_cache')
      .select('gers_id, menu_text, hours_text, json_ld_weekday_descriptions, is_dead')
      .in('gers_id', uncachedPlaces.map((p) => p.gers_id));

    for (const row of scrapeRows ?? []) {
      if (row.is_dead) {
        excludedPlaceIds.push(row.gers_id);
        continue;
      }
      const jsonLd = Array.isArray(row.json_ld_weekday_descriptions)
        ? row.json_ld_weekday_descriptions.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      scrapeByGersId.set(row.gers_id, {
        menuText: typeof row.menu_text === 'string' ? row.menu_text : '',
        hoursText: typeof row.hours_text === 'string' ? row.hours_text : '',
        jsonLdWeekdayDescriptions: jsonLd.length === 7 ? jsonLd : [],
        deadWebsite: false,
      });
    }

    const needLive = uncachedPlaces.filter((p) => !scrapeByGersId.has(p.gers_id) && !excludedPlaceIds.includes(p.gers_id));
    console.log(
      `[v2-generate-ai-overview] Scrape cache: ${scrapeByGersId.size} hits, ${excludedPlaceIds.length} dead, ${needLive.length} to fetch`
    );

    // ── Step 3: Ping + scrape only cache misses ───────────────────────────────
    const pingResults = await mapPool(needLive, PING_CONCURRENCY, async (place) => {
      if (!place.website_url) return { place, alive: false };
      const result = await pingWebsite(place.website_url);
      return { place, alive: result !== 'dead' };
    });

    const aliveToScrape: InputPlace[] = [];
    for (const { place, alive } of pingResults) {
      if (!alive) excludedPlaceIds.push(place.gers_id);
      else aliveToScrape.push(place);
    }

    await Promise.all(
      aliveToScrape.map(async (p) => {
        if (!p.website_url) return;
        try {
          const result = await scrapeWebsite(p.website_url);
          scrapeByGersId.set(p.gers_id, result);
        } catch (err) {
          const msg = String(err instanceof Error ? err.message : err);
          if (isDeadTransportError(msg) || err instanceof TypeError) {
            scrapeByGersId.set(p.gers_id, {
              menuText: '',
              hoursText: '',
              jsonLdWeekdayDescriptions: [],
              deadWebsite: true,
            });
          }
        }
      })
    );

    const scrapeUpserts: Record<string, unknown>[] = [];
    const geminiPlaces: InputPlace[] = [];
    const scrapeDeadIds: string[] = [];

    for (const place of uncachedPlaces) {
      if (excludedPlaceIds.includes(place.gers_id) && !scrapeByGersId.has(place.gers_id)) {
        scrapeDeadIds.push(place.gers_id);
        continue;
      }
      const scraped = scrapeByGersId.get(place.gers_id);
      if (!scraped) continue;
      if (scraped.deadWebsite) {
        scrapeDeadIds.push(place.gers_id);
        if (!excludedPlaceIds.includes(place.gers_id)) excludedPlaceIds.push(place.gers_id);
        scrapeUpserts.push({
          gers_id: place.gers_id,
          website_url: place.website_url ?? null,
          menu_text: null,
          hours_text: null,
          json_ld_weekday_descriptions: null,
          is_dead: true,
          scraped_at: new Date().toISOString(),
        });
        continue;
      }
      geminiPlaces.push(place);
      if (needLive.some((p) => p.gers_id === place.gers_id)) {
        scrapeUpserts.push({
          gers_id: place.gers_id,
          website_url: place.website_url ?? null,
          menu_text: scraped.menuText || null,
          hours_text: scraped.hoursText || null,
          json_ld_weekday_descriptions:
            scraped.jsonLdWeekdayDescriptions.length === 7
              ? scraped.jsonLdWeekdayDescriptions
              : null,
          is_dead: false,
          scraped_at: new Date().toISOString(),
        });
      }
    }

    if (scrapeDeadIds.length > 0) {
      await supabase.from('v2_rejected_places').upsert(
        [...new Set(scrapeDeadIds)].map((gers_id) => ({ gers_id, reason: 'dead_website' })),
        { onConflict: 'gers_id', ignoreDuplicates: true },
      );
    }
    if (scrapeUpserts.length > 0) {
      await supabase.from('v2_website_scrape_cache').upsert(scrapeUpserts, { onConflict: 'gers_id' });
    }

    // ── Step 4: Pack into full batches of BATCH_SIZE, run all in parallel ──────
    const batches: InputPlace[][] = [];
    for (let i = 0; i < geminiPlaces.length; i += BATCH_SIZE) {
      batches.push(geminiPlaces.slice(i, i + BATCH_SIZE));
    }

    console.log(`[v2-generate-ai-overview] Running ${batches.length} Gemini batch(es) in parallel...`);
    const batchResultsAll = await Promise.all(
      batches.map(batch => runGeminiBatch(batch, geminiUrl, scrapeByGersId))
    );
    const generatedOverviews: { gersId: string; overview: AiOverview }[] = [];
    for (const result of batchResultsAll) {
      generatedOverviews.push(...result.overviews);
    }
    console.log(
      `[v2-generate-ai-overview] Gemini generated ${generatedOverviews.length} overviews; ` +
      `excluded ${excludedPlaceIds.length} dead/no-website places`
    );

    // ── Step 4: Upsert to v2_ai_overview_cache + v2_ai_overview_details ───────
    const updatedAt = new Date().toISOString();
    const placeMap = new Map(uncachedPlaces.map(p => [p.gers_id, p]));

    if (generatedOverviews.length > 0) {
      // Cache row must exist before the details row (FK on gers_id).
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
            weekday_descriptions: overview.weekdayDescriptions.length > 0 ? overview.weekdayDescriptions : null,
            website_url: place?.website_url ?? null,
            updated_at: updatedAt,
          }, { onConflict: 'gers_id' });
        })
      );
      await Promise.all(
        generatedOverviews.map(({ gersId, overview }) =>
          supabase.from('v2_ai_overview_details').upsert({
            gers_id: gersId,
            absolute_macros: overview.absoluteMacros,
            who_this_place_is_for: overview.whoThisPlaceIsFor,
            updated_at: updatedAt,
          }, { onConflict: 'gers_id' })
        )
      );
      console.log(`[v2-generate-ai-overview] Supabase upsert complete: ${generatedOverviews.length} rows written to v2_ai_overview_cache + v2_ai_overview_details`);
    }

    return new Response(JSON.stringify({ generatedOverviews, excludedPlaceIds }), {
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
