import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

export const AI_OVERVIEW_FIELD_PLACEHOLDER = '-';

export type AiOverview = {
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
};

export type PlaceSeed = {
  id: string;
  name: string;
  website_url?: string | null;
  address?: string | null;
  city?: string | null;
  category?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  phone?: string | null;
};

type AiOverviewRow = {
  gers_id: string;
  summary_good_bad: string | null;
  speed_score: number | null;
  health_score: number | null;
  workout_recovery_score: number | null;
  processed_score: number | null;
  calorie_score: number | null;
  protein_score: number | null;
  carb_score: number | null;
  date_worthiness: number | null;
  noise_level_estimate: number | null;
  group_size_sweet_spot: number | null;
  absolute_macros: string | null;
  who_this_place_is_for: string | null;
  taste_score?: number | null;
  value_for_money_score?: number | null;
  hungover_recovery_score?: number | null;
  munchy_score?: number | null;
  variety_score?: number | null;
  macro_friendly_score?: number | null;
  solo_diner_score?: number | null;
  energy_sustain_score?: number | null;
  work_friendly_score?: number | null;
  top_menu_items?: unknown | null;
  price_tier?: number | null;
  cuisine_key?: string | null;
};

const localMemory = new Map<string, AiOverview>();

const normalizeRow = (row: AiOverviewRow): AiOverview | null => {
  if (!row.summary_good_bad || !row.absolute_macros || !row.who_this_place_is_for) return null;
  if (
    row.speed_score === null || row.health_score === null ||
    row.workout_recovery_score === null || row.processed_score === null ||
    row.calorie_score === null || row.protein_score === null ||
    row.carb_score === null || row.date_worthiness === null ||
    row.noise_level_estimate === null || row.group_size_sweet_spot === null
  ) return null;

  const rawItems = Array.isArray(row.top_menu_items) ? row.top_menu_items : [];
  const topMenuItems = rawItems.map((item: any) => ({
    name: String(item?.name ?? ''),
    price: String(item?.price ?? ''),
    overview: String(item?.overview ?? ''),
  }));

  return {
    summaryGoodBad: row.summary_good_bad,
    speedScore: row.speed_score,
    healthScore: row.health_score,
    workoutRecoveryScore: row.workout_recovery_score,
    processedScore: row.processed_score,
    calorieScore: row.calorie_score,
    proteinScore: row.protein_score,
    carbScore: row.carb_score,
    dateWorthiness: row.date_worthiness,
    noiseLevelEstimate: row.noise_level_estimate,
    groupSizeSweetSpot: row.group_size_sweet_spot,
    absoluteMacros: row.absolute_macros,
    whoThisPlaceIsFor: row.who_this_place_is_for,
    tasteScore: row.taste_score ?? 0,
    valueForMoneyScore: row.value_for_money_score ?? 0,
    hungoverRecoveryScore: row.hungover_recovery_score ?? 0,
    munchyScore: row.munchy_score ?? 0,
    varietyScore: row.variety_score ?? 0,
    macroFriendlyScore: row.macro_friendly_score ?? 0,
    soloDinerScore: row.solo_diner_score ?? 0,
    energySustainScore: row.energy_sustain_score ?? 0,
    workFriendlyScore: row.work_friendly_score ?? 0,
    topMenuItems,
    priceTier: row.price_tier ?? 2,
    cuisineKey: row.cuisine_key ?? 'general',
  };
};

const fromStorageJson = (value: string | null): AiOverview | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AiOverview>;
    if (!parsed?.summaryGoodBad || !parsed?.absoluteMacros || !parsed?.whoThisPlaceIsFor) return null;
    const z = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const zf = (v: unknown) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
      return Number(v.toFixed(1));
    };
    return {
      summaryGoodBad: parsed.summaryGoodBad,
      speedScore: z(parsed.speedScore),
      healthScore: zf(parsed.healthScore),
      workoutRecoveryScore: z(parsed.workoutRecoveryScore),
      processedScore: z(parsed.processedScore),
      calorieScore: z(parsed.calorieScore),
      proteinScore: z(parsed.proteinScore),
      carbScore: z(parsed.carbScore),
      dateWorthiness: z(parsed.dateWorthiness),
      noiseLevelEstimate: z(parsed.noiseLevelEstimate),
      groupSizeSweetSpot: (() => { const g = z(parsed.groupSizeSweetSpot); return g >= 1 && g <= 6 ? g : 2; })(),
      absoluteMacros: parsed.absoluteMacros,
      whoThisPlaceIsFor: parsed.whoThisPlaceIsFor,
      tasteScore: z(parsed.tasteScore),
      valueForMoneyScore: z(parsed.valueForMoneyScore),
      hungoverRecoveryScore: z(parsed.hungoverRecoveryScore),
      munchyScore: z(parsed.munchyScore),
      varietyScore: z(parsed.varietyScore),
      macroFriendlyScore: z(parsed.macroFriendlyScore),
      soloDinerScore: z(parsed.soloDinerScore),
      energySustainScore: z(parsed.energySustainScore),
      workFriendlyScore: z(parsed.workFriendlyScore),
      topMenuItems: Array.isArray(parsed.topMenuItems) ? parsed.topMenuItems : [],
      priceTier: typeof parsed.priceTier === 'number' ? parsed.priceTier : 2,
      cuisineKey: typeof parsed.cuisineKey === 'string' ? parsed.cuisineKey : 'general',
    };
  } catch {
    return null;
  }
};

export function toPlaceSeed(place: {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  website_url?: string | null;
  websiteUri?: string | null;
  address?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  category?: string | null;
  primaryType?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  phone?: string | null;
  nationalPhoneNumber?: string | null;
}): PlaceSeed | null {
  if (!place.id) return null;
  return {
    id: place.id,
    name: place.name ?? place.displayName?.text ?? '',
    website_url: place.website_url ?? place.websiteUri ?? null,
    address: place.address ?? place.formattedAddress ?? null,
    city: place.city ?? null,
    category: place.category ?? place.primaryType ?? null,
    location: place.location ?? null,
    phone: place.phone ?? place.nationalPhoneNumber ?? null,
  };
}

export const getCachedAiOverviewsForPlaces = async (
  places: Array<{ id?: string; name?: string; displayName?: { text?: string }; website_url?: string | null; websiteUri?: string | null; address?: string | null; formattedAddress?: string | null; city?: string | null; category?: string | null; primaryType?: string | null; location?: { latitude?: number; longitude?: number } | null; phone?: string | null; nationalPhoneNumber?: string | null }>
): Promise<Map<string, AiOverview>> => {
  const seeds = places.map(toPlaceSeed).filter((p): p is PlaceSeed => p != null);
  const result = new Map<string, AiOverview>();
  const uniquePlaces = Array.from(
    new Map(seeds.filter(p => p?.id).map(p => [p.id, p])).values()
  );
  if (uniquePlaces.length === 0) return result;

  const gersIds = uniquePlaces.map(p => p.id);
  const needsStorage: string[] = [];

  for (const gersId of gersIds) {
    const memo = localMemory.get(gersId);
    if (memo) {
      result.set(gersId, memo);
    } else {
      needsStorage.push(gersId);
    }
  }

  if (needsStorage.length > 0) {
    const pairs = await AsyncStorage.multiGet(needsStorage.map(id => `v2_ai_overview_${id}`));
    const needsDb: string[] = [];
    for (const [key, value] of pairs) {
      const gersId = key.replace('v2_ai_overview_', '');
      const overview = fromStorageJson(value);
      if (overview) {
        localMemory.set(gersId, overview);
        result.set(gersId, overview);
      } else {
        needsDb.push(gersId);
      }
    }

    if (needsDb.length > 0) {
      const { data, error } = await supabase
        .from('v2_ai_overview_cache')
        .select(
          'gers_id, summary_good_bad, speed_score, health_score, workout_recovery_score, ' +
          'processed_score, calorie_score, protein_score, carb_score, date_worthiness, ' +
          'noise_level_estimate, group_size_sweet_spot, absolute_macros, who_this_place_is_for, ' +
          'taste_score, value_for_money_score, hungover_recovery_score, munchy_score, ' +
          'variety_score, macro_friendly_score, solo_diner_score, energy_sustain_score, ' +
          'work_friendly_score, top_menu_items, price_tier, cuisine_key'
        )
        .in('gers_id', needsDb);

      if (!error && data) {
        console.log(`[AI] Supabase v2_ai_overview_cache: ${data.length} rows returned for ${needsDb.length} GERS IDs`);
        const backfills: [string, string][] = [];
        for (const row of (data as unknown as AiOverviewRow[])) {
          const normalized = normalizeRow(row);
          if (!normalized) continue;
          localMemory.set(row.gers_id, normalized);
          result.set(row.gers_id, normalized);
          backfills.push([`v2_ai_overview_${row.gers_id}`, JSON.stringify(normalized)]);
        }
        if (backfills.length > 0) {
          AsyncStorage.multiSet(backfills).catch(() => undefined);
        }
      } else if (error) {
        console.warn('[AI] Supabase v2_ai_overview_cache read error:', error.message);
      }
    }
  }

  return result;
};

export const invokeGenerateAiOverviewsForPlaces = async (
  places: PlaceSeed[],
  missingGersIds: string[]
): Promise<Map<string, AiOverview>> => {
  const out = new Map<string, AiOverview>();
  const uniquePlaces = Array.from(
    new Map(places.filter(p => p?.id).map(p => [p.id, p])).values()
  );
  const placeMap = new Map(uniquePlaces.map(p => [p.id, p]));

  const payloadPlaces = missingGersIds
    .map(id => placeMap.get(id))
    .filter(Boolean)
    .map(p => ({
      gers_id: p!.id,
      name: p!.name,
      website_url: p!.website_url ?? null,
      address: p!.address ?? null,
      city: p!.city ?? null,
      category: p!.category ?? null,
      location: p!.location ?? null,
      phone: p!.phone ?? null,
    }));

  if (payloadPlaces.length === 0) return out;

  const { data: generatedData, error: invokeError } = await supabase.functions.invoke(
    'v2-generate-ai-overview',
    {
      body: { places: payloadPlaces },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    }
  );

  if (invokeError || !generatedData?.generatedOverviews) {
    console.warn('[AI] v2-generate-ai-overview invoke error:', invokeError?.message ?? 'no data');
    return out;
  }

  const backfills: [string, string][] = [];
  for (const item of generatedData.generatedOverviews as { gersId: string; overview: AiOverview }[]) {
    if (!item?.gersId || !item?.overview) continue;
    localMemory.set(item.gersId, item.overview);
    out.set(item.gersId, item.overview);
    backfills.push([`v2_ai_overview_${item.gersId}`, JSON.stringify(item.overview)]);
  }
  if (backfills.length > 0) {
    AsyncStorage.multiSet(backfills).catch(() => undefined);
  }

  return out;
};

export function mergeAiOverviewsOntoPlaces<T extends { id?: string }>(
  places: T[],
  aiById: Map<string, AiOverview>
): T[] {
  return places.map(place => {
    const gersId = place.id;
    const ai = gersId ? aiById.get(gersId) : undefined;
    if (!ai) return { ...place };
    return {
      ...place,
      aiOverview: ai,
      healthScore: ai.healthScore,
      priceTier: ai.priceTier,
      cuisineKey: ai.cuisineKey,
      topMenuItems: ai.topMenuItems,
    };
  });
}
