import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

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
  nationalPhoneNumber?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] } | null;
  regularOpeningHours?: { weekdayDescriptions?: string[] } | null;
  servesBreakfast?: boolean | null;
  servesLunch?: boolean | null;
  servesDinner?: boolean | null;
  servesVegetarianFood?: boolean | null;
  servesVeganFood?: boolean | null;
  servesWine?: boolean | null;
  servesBeer?: boolean | null;
  servesCocktails?: boolean | null;
  servesDessert?: boolean | null;
  servesCoffee?: boolean | null;
  goodForChildren?: boolean | null;
  takeout?: boolean | null;
  delivery?: boolean | null;
  dineIn?: boolean | null;
  curbsidePickup?: boolean | null;
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  } | null;
  parkingOptions?: {
    freeParkingLot?: boolean;
    freeStreetParking?: boolean;
    valetParking?: boolean;
    paidGarageParking?: boolean;
    paidStreetParking?: boolean;
  } | null;
  editorialSummary?: string;
  allowsDogs?: boolean | null;
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
};

const promptForPlace = (place: InputPlace) => `
You are generating one restaurant AI overview for downstream parsing.
Return JSON only. Do not include markdown. Do not include explanations outside JSON.
If the restaurant appears to be part of a chain, you may use reliable chain-level patterns and commonly known chain menu tendencies to improve accuracy. Prefer listing-specific signals when they conflict with chain-level assumptions, and keep uncertainty caveats explicit.

Restaurant:
- placeId: ${place.id}
- name: ${place.name ?? ''}
- formattedAddress: ${place.formattedAddress ?? ''}
- primaryType: ${place.primaryType ?? ''}
- primaryTypeDisplayName: ${place.primaryTypeDisplayName ?? ''}
- types: ${(place.types ?? []).join(', ')}
- priceLevel: ${place.priceLevel ?? ''}
- rating: ${place.rating ?? ''}
- userRatingCount: ${place.userRatingCount ?? ''}
- googleMapsUri: ${place.googleMapsUri ?? ''}
- websiteUri: ${place.websiteUri ?? ''}
- nationalPhoneNumber: ${place.nationalPhoneNumber ?? ''}
- businessStatus: ${place.businessStatus ?? ''}
- coordinates: lat=${place.location?.latitude ?? ''}, lng=${place.location?.longitude ?? ''}
- openNow: ${place.currentOpeningHours?.openNow ?? ''}
- weekdayDescriptions: ${((place.currentOpeningHours?.weekdayDescriptions ?? place.regularOpeningHours?.weekdayDescriptions) ?? []).join(' | ')}
- servesBreakfast: ${place.servesBreakfast ?? ''}
- servesLunch: ${place.servesLunch ?? ''}
- servesDinner: ${place.servesDinner ?? ''}
- servesVegetarianFood: ${place.servesVegetarianFood ?? ''}
- servesVeganFood: ${place.servesVeganFood ?? ''}
- servesWine: ${place.servesWine ?? ''}
- servesBeer: ${place.servesBeer ?? ''}
- servesCocktails: ${place.servesCocktails ?? ''}
- servesDessert: ${place.servesDessert ?? ''}
- servesCoffee: ${place.servesCoffee ?? ''}
- goodForChildren: ${place.goodForChildren ?? ''}
- takeout: ${place.takeout ?? ''}
- delivery: ${place.delivery ?? ''}
- dineIn: ${place.dineIn ?? ''}
- curbsidePickup: ${place.curbsidePickup ?? ''}
- paymentOptions: ${JSON.stringify(place.paymentOptions ?? {})}
- parkingOptions: ${JSON.stringify(place.parkingOptions ?? {})}
- editorialSummary: ${place.editorialSummary ?? ''}
- allowsDogs: ${place.allowsDogs ?? ''}

Output format requirements:
1) Return exactly one JSON object with exactly these keys and no extras:
{
  "summaryGoodBad": "string",
  "speedScore": 0,
  "healthScore": 0.0,
  "workoutRecoveryScore": 0,
  "processedScore": 0,
  "calorieScore": 0,
  "proteinScore": 0,
  "carbScore": 0,
  "dateWorthiness": 0,
  "noiseLevelEstimate": 0,
  "groupSizeSweetSpot": 1,
  "absoluteMacros": "string",
  "whoThisPlaceIsFor": "string"
}
2) summaryGoodBad: concise balanced pros and cons, max 320 chars.
3) speedScore: integer 0-5 where 0 is slowest.
4) healthScore: decimal 0-10 where 10 is best; one decimal place allowed.
5) workoutRecoveryScore: integer 0-10 where 10 is best; no decimals.
6) processedScore: integer 0-10 where 10 means least processed; no decimals.
7) calorieScore: integer 0-5 where 5 is most calories.
8) proteinScore: integer 0-5 where 5 is most protein.
9) carbScore: integer 0-5 where 5 is most carbs.
10) dateWorthiness: integer 0-5 where 5 is best.
11) noiseLevelEstimate: integer 0-5 where 5 is most noisy.
12) groupSizeSweetSpot: integer 1-6 people.
13) absoluteMacros: include estimated absolute calories/protein/carbs/fat plus an AI uncertainty caveat in one string.
14) whoThisPlaceIsFor: single concise string describing who this place is really for.
15) Do not group classifications into combined labels.
16) Use googleMapsUri and coordinates to disambiguate the exact listing when signals conflict.
`;

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
    Number.isNaN(groupSizeSweetSpot)
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

    for (const place of missingOnly) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptForPlace(place) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
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

      const overview = sanitizeOverview(parsed);
      if (!overview) continue;

      generatedOverviews.push({ placeId: place.id, overview });

      await supabase.from('ai_overview_cache').upsert({
        place_id: place.id,
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
        updated_at: new Date().toISOString(),
      });
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
