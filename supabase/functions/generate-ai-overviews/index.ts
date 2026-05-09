import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const BATCH_SIZE = 10;

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

type InputPlace = {
  id: string;
  name?: string;
  formattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: string;
  types?: string[];
  priceLevel?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  location?: { latitude?: number; longitude?: number } | null;
  googleMapsUri?: string;
  websiteUri?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] } | null;
  regularOpeningHours?: { weekdayDescriptions?: string[] } | null;
  priceRange?: {
    startPrice?: { units?: string; nanos?: number; currencyCode?: string };
    endPrice?: { units?: string; nanos?: number; currencyCode?: string };
  } | null;
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
};

const overviewItemSchema = {
  type: 'OBJECT',
  properties: {
    placeId: { type: 'STRING' },
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
  },
  required: [
    'placeId',
    'summaryGoodBad',
    'speedScore',
    'healthScore',
    'workoutRecoveryScore',
    'processedScore',
    'calorieScore',
    'proteinScore',
    'carbScore',
    'dateWorthiness',
    'noiseLevelEstimate',
    'groupSizeSweetSpot',
    'absoluteMacros',
    'whoThisPlaceIsFor',
    'tasteScore',
    'valueForMoneyScore',
    'hungoverRecoveryScore',
    'munchyScore',
    'varietyScore',
    'macroFriendlyScore',
    'soloDinerScore',
    'energySustainScore',
    'workFriendlyScore',
  ],
} as const;

const batchResponseSchema = {
  type: 'OBJECT',
  properties: {
    overviews: {
      type: 'ARRAY',
      items: overviewItemSchema,
    },
  },
  required: ['overviews'],
} as const;

const SYSTEM_INSTRUCTION = `You are generating restaurant AI overviews for downstream parsing.
Return JSON only at the root: an object with a single key "overviews" whose value is an array.
The array must contain exactly one object per restaurant provided in the user message, in the same order, each with "placeId" matching that restaurant's ID and exactly the score keys defined in the response schema (no extra keys).

If a restaurant appears to be part of a chain, you may use reliable chain-level patterns and commonly known chain menu tendencies to improve accuracy. Prefer listing-specific signals when they conflict with chain-level assumptions, and keep uncertainty caveats explicit.

Use the provided Google Places signals plus reliable category and chain-level knowledge to construct an accurate, context-aware overview. Keep uncertainty caveats explicit when listing-specific signals are limited.

Field rules:
1) summaryGoodBad: concise balanced pros and cons, max 320 chars.
2) speedScore: integer 0-5 where 0 is slowest service / longest wait for typical orders.
3) healthScore: decimal 0-10 where 10 is best; one decimal place allowed.
4) workoutRecoveryScore: integer 0-10 where 10 is best for gym recovery; no decimals.
5) processedScore: integer 0-10 where 10 means least processed; no decimals.
6) calorieScore: integer 0-5 where 5 is most calories.
7) proteinScore: integer 0-5 where 5 is most protein.
8) carbScore: integer 0-5 where 5 is most carbs.
9) dateWorthiness: integer 0-5 where 5 is best.
10) noiseLevelEstimate: integer 0-5 where 5 is most noisy.
11) groupSizeSweetSpot: integer 1-6 people.
12) absoluteMacros: include estimated absolute calories/protein/carbs/fat plus an AI uncertainty caveat in one string.
13) whoThisPlaceIsFor: single concise string describing who this place is really for.
14) tasteScore: integer 0-5 where 5 is best overall flavor execution for this concept.
15) valueForMoneyScore: integer 0-5 where 5 is best value; MUST explicitly weigh Price Level and Price Range against typical portion and quality for this listing.
16) hungoverRecoveryScore: integer 0-5 where 5 best eases hangover symptoms (greasy/salty/carby comfort without guessing medical claims).
17) munchyScore: integer 0-5 where 5 best satisfies late-night munchies / craveable indulgence.
18) varietyScore: integer 0-5 where 5 is broad menu variety or strong customizable options.
19) macroFriendlyScore: integer 0-5 where 5 means easiest to estimate calories/macros (labeled menus, bowl-builders, consistent portions).
20) soloDinerScore: integer 0-5 where 5 is most welcoming to dining alone (counter/bar seating, low awkwardness).
21) energySustainScore: integer 0-5 where 5 is slow sustained fullness/energy after eating; 0 is sharp spike then crash for typical orders.
22) workFriendlyScore: integer 0-5 where 5 is best for laptop work (wifi/outlets/seating/time limits vibe); infer from category plus listing hints when possible.
23) Do not group classifications into combined labels.
24) Use googleMapsUri and coordinates to disambiguate the exact listing when signals conflict.`;

const formatPlaceBlock = (place: InputPlace): string => {
  const hours = (place.currentOpeningHours?.weekdayDescriptions ??
    place.regularOpeningHours?.weekdayDescriptions ??
    []) as string[];
  const hoursLine = hours.join(' | ');
  const openNow =
    place.currentOpeningHours?.openNow === undefined
      ? ''
      : String(place.currentOpeningHours.openNow);
  return [
    `ID: ${place.id}`,
    `Name: ${place.name ?? ''}`,
    `Address: ${place.formattedAddress ?? ''}`,
    `Category: ${place.primaryTypeDisplayName ?? place.primaryType ?? ''}`,
    `Types: ${(place.types ?? []).join(', ')}`,
    `Business Status: ${place.businessStatus ?? ''}`,
    `Price Level: ${place.priceLevel ?? ''}`,
    `Price Range: ${JSON.stringify(place.priceRange ?? {})}`,
    `Rating: ${place.rating ?? ''} (${place.userRatingCount ?? 0} user ratings)`,
    `Coordinates: lat=${place.location?.latitude ?? ''}, lng=${place.location?.longitude ?? ''}`,
    `Maps Link: ${place.googleMapsUri ?? ''}`,
    `Website: ${place.websiteUri ?? ''}`,
    `Open Now: ${openNow}`,
    `Opening Hours: ${hoursLine}`,
  ].join('\n');
};

const userPromptForBatch = (places: InputPlace[]): string => {
  const blocks = places.map((p, i) => `--- Restaurant ${i + 1} ---\n${formatPlaceBlock(p)}`).join('\n\n');
  return `You are given exactly ${places.length} restaurant(s). Return one JSON object with key "overviews" whose value is an array of exactly ${places.length} objects (same order). Each object must include "placeId" matching the listing ID and all required score fields.

${blocks}`;
};

const sanitizeOverview = (raw: any): AiOverview | null => {
  if (!raw || typeof raw !== 'object') return null;

  const toInt = (v: any) => Number.parseInt(String(v), 10);
  const toFloat = (v: any) => Number.parseFloat(String(v));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const summaryGoodBad = String(raw.summaryGoodBad ?? '').trim();
  const absoluteMacros = String(raw.absoluteMacros ?? '').trim();
  const whoThisPlaceIsFor = String(raw.whoThisPlaceIsFor ?? '').trim();
  if (!summaryGoodBad || !absoluteMacros || !whoThisPlaceIsFor) return null;

  const speedScore = clamp(toInt(raw.speedScore), 0, 5);
  const healthScore = clamp(toFloat(raw.healthScore), 0, 10);
  const workoutRecoveryScore = clamp(toInt(raw.workoutRecoveryScore), 0, 10);
  const processedScore = clamp(toInt(raw.processedScore), 0, 10);
  const calorieScore = clamp(toInt(raw.calorieScore), 0, 5);
  const proteinScore = clamp(toInt(raw.proteinScore), 0, 5);
  const carbScore = clamp(toInt(raw.carbScore), 0, 5);
  const dateWorthiness = clamp(toInt(raw.dateWorthiness), 0, 5);
  const noiseLevelEstimate = clamp(toInt(raw.noiseLevelEstimate), 0, 5);
  const groupSizeSweetSpot = clamp(toInt(raw.groupSizeSweetSpot), 1, 6);

  const tasteScore = clamp(toInt(raw.tasteScore ?? 0), 0, 5);
  const valueForMoneyScore = clamp(toInt(raw.valueForMoneyScore ?? 0), 0, 5);
  const hungoverRecoveryScore = clamp(toInt(raw.hungoverRecoveryScore ?? 0), 0, 5);
  const munchyScore = clamp(toInt(raw.munchyScore ?? 0), 0, 5);
  const varietyScore = clamp(toInt(raw.varietyScore ?? 0), 0, 5);
  const macroFriendlyScore = clamp(toInt(raw.macroFriendlyScore ?? 0), 0, 5);
  const soloDinerScore = clamp(toInt(raw.soloDinerScore ?? 0), 0, 5);
  const energySustainScore = clamp(toInt(raw.energySustainScore ?? 0), 0, 5);
  const workFriendlyScore = clamp(toInt(raw.workFriendlyScore ?? 0), 0, 5);

  if (
    Number.isNaN(speedScore) ||
    Number.isNaN(healthScore) ||
    Number.isNaN(workoutRecoveryScore) ||
    Number.isNaN(processedScore) ||
    Number.isNaN(calorieScore) ||
    Number.isNaN(proteinScore) ||
    Number.isNaN(carbScore) ||
    Number.isNaN(dateWorthiness) ||
    Number.isNaN(noiseLevelEstimate) ||
    Number.isNaN(groupSizeSweetSpot) ||
    Number.isNaN(tasteScore) ||
    Number.isNaN(valueForMoneyScore) ||
    Number.isNaN(hungoverRecoveryScore) ||
    Number.isNaN(munchyScore) ||
    Number.isNaN(varietyScore) ||
    Number.isNaN(macroFriendlyScore) ||
    Number.isNaN(soloDinerScore) ||
    Number.isNaN(energySustainScore) ||
    Number.isNaN(workFriendlyScore)
  ) {
    return null;
  }

  return {
    summaryGoodBad,
    speedScore,
    healthScore: Number(healthScore.toFixed(1)),
    workoutRecoveryScore,
    processedScore,
    calorieScore,
    proteinScore,
    carbScore,
    dateWorthiness,
    noiseLevelEstimate,
    groupSizeSweetSpot,
    absoluteMacros,
    whoThisPlaceIsFor,
    tasteScore,
    valueForMoneyScore,
    hungoverRecoveryScore,
    munchyScore,
    varietyScore,
    macroFriendlyScore,
    soloDinerScore,
    energySustainScore,
    workFriendlyScore,
  };
};

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
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is missing from edge function environment');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const generatedOverviews: { placeId: string; overview: AiOverview }[] = [];
    const missingOnly = (places as InputPlace[]).filter((p) => p?.id);

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    for (let i = 0; i < missingOnly.length; i += BATCH_SIZE) {
      const batch = missingOnly.slice(i, i + BATCH_SIZE);
      const batchIds = new Set(batch.map((p) => p.id));

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [{ role: 'user', parts: [{ text: userPromptForBatch(batch) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: batchResponseSchema,
          },
        }),
      });

      if (!response.ok) {
        continue;
      }

      const modelData = await response.json();
      const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        continue;
      }

      const items = parsed?.overviews;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const placeId = String(item?.placeId ?? '').trim();
        if (!placeId || !batchIds.has(placeId)) continue;

        const overview = sanitizeOverview(item);
        if (!overview) continue;

        generatedOverviews.push({ placeId, overview });

        await supabase.from('ai_overview_cache').upsert({
          place_id: placeId,
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
          updated_at: new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({ generatedOverviews }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
