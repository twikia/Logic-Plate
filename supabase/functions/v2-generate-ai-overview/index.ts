import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 15;
const MAX_PLACES_PER_REQUEST = 60;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const MAX_ATTR_CHARS = 700;

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
  operating_status?: string | null;
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
- priceTier 1-4 (1=budget … 4=fine dining); prefer price hint / category over guessing
- cuisineKey: one of italian,mexican,american,japanese,chinese,thai,indian,mediterranean,korean,vietnamese,french,greek,middle_eastern,caribbean,african,latin,cafe,bar,pizza,burger,sandwich,seafood,steak,sushi,ramen,bbq,vegan,vegetarian,dessert,bakery,fast_food,breakfast,brunch,general

Use only provided facts (category, brand/cuisine tags, closed status, price hint). Do not invent menu items or hours. If Status is closed, say so in summaryGoodBad.`;

// ─── Place Text Block Builder ─────────────────────────────────────────────────

function selectRelevantAttributes(attrs: string[] | null | undefined): string[] {
  if (!attrs?.length) return [];
  const out: string[] = [];
  let used = 0;
  for (const raw of attrs) {
    const line = String(raw ?? '').trim();
    if (!line || !ATTR_KEEP_RE.test(line)) continue;
    let next = line;
    if (/^OSM tags:/i.test(line)) {
      const body = line.replace(/^OSM tags:\s*/i, '');
      const kept = body
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p && OSM_TAG_KEEP_RE.test(p));
      if (kept.length === 0) continue;
      next = `OSM tags: ${kept.slice(0, 12).join('; ')}`;
    }
    if (used + next.length + 1 > MAX_ATTR_CHARS) break;
    out.push(next);
    used += next.length + 1;
  }
  return out;
}

function buildPlaceBlock(place: InputPlace): string {
  const lines = [
    `GERS ID: ${place.gers_id}`,
    `Name: ${place.name}`,
    `Category: ${place.category || 'restaurant'}`,
  ];
  if (place.price_tier != null) lines.push(`Price tier hint: ${place.price_tier}`);
  if (place.operating_status && place.operating_status !== 'open') {
    lines.push(`Status: ${place.operating_status.replace(/_/g, ' ')}`);
  }
  const attrs = selectRelevantAttributes(place.attributes);
  if (attrs.length > 0) {
    lines.push(`Map facts:\n${attrs.join('\n')}`);
  }
  return lines.join('\n');
}

function buildBatchPrompt(batch: InputPlace[]): string {
  const blocks = batch.map((p, i) =>
    `=== ${i + 1} ===\n${buildPlaceBlock(p)}`
  ).join('\n\n');

  return `Score these ${batch.length} restaurant(s). Return {"overviews":[...]} with ${batch.length} objects in the same order.\n\n${blocks}`;
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

function sanitizeOverview(
  raw: any,
  priceTierHint?: number | null,
  weekdayDescriptions: string[] = [],
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
  const priceTier = clamp(modelPriceTier, 1, 4);

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
    // Hours are Overture-only; never invent from Gemini.
    weekdayDescriptions: weekdayDescriptions.length === 7 ? weekdayDescriptions : [],
  };
}

async function runGeminiBatch(
  batch: InputPlace[],
  geminiUrl: string
): Promise<{ gersId: string; overview: AiOverview }[]> {
  const out: { gersId: string; overview: AiOverview }[] = [];
  const batchIds = new Set(batch.map(p => p.gers_id));

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildBatchPrompt(batch) }] }],
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

    const place = batch.find(p => p.gers_id === gersId);
    const overtureHours =
      place?.regular_opening_hours?.weekdayDescriptions?.length === 7
        ? place.regular_opening_hours.weekdayDescriptions
        : [];
    const overview = sanitizeOverview(item, place?.price_tier ?? null, overtureHours);
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

    const validPlaces = (places as InputPlace[])
      .filter(p => p?.gers_id)
      .slice(0, MAX_PLACES_PER_REQUEST);

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

    const batches: InputPlace[][] = [];
    for (let i = 0; i < uncachedPlaces.length; i += BATCH_SIZE) {
      batches.push(uncachedPlaces.slice(i, i + BATCH_SIZE));
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    console.log(`[v2-generate-ai-overview] Running ${batches.length} Gemini batch(es) of up to ${BATCH_SIZE}...`);
    const generatedOverviews: { gersId: string; overview: AiOverview }[] = [];
    for (const batch of batches) {
      const batchResults = await runGeminiBatch(batch, geminiUrl);
      generatedOverviews.push(...batchResults);
    }
    console.log(`[v2-generate-ai-overview] Gemini generated ${generatedOverviews.length} overviews`);

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
