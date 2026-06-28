import type { AiOverview } from './aiOverviewCache';
import { ratingConfidenceCurve } from './ratingCalculator';
import { isOpenNow } from './isOpenNow';
import {
  bestFavoriteCuisineRankIndex,
  cuisineFitScoreForRank,
  placeMatchesFavoriteCuisine,
} from './recommendationCuisines';
import { getRecommendationPrefs } from './recommendationPrefs';
import { getLaunchIntent, type LaunchIntentCategory } from './launchIntent';
import type { RecommendationWeights } from './recommendationTypes';
import type {
  ImportanceLevel,
  MatchPillKind,
  MealTypeContext,
  RecommendationPrefsV1,
  ScoredRestaurant,
  SessionGroupChip,
  SessionMood,
  SessionOverrides,
} from './recommendationTypes';
const HEALTH_BASE: Record<string, number> = {
  health_food_restaurant: 5,
  salad_shop: 5,
  juice_shop: 4,
  vegetarian_restaurant: 4,
  vegan_restaurant: 4,
  acai_shop: 4,
  japanese_restaurant: 4,
  sushi_restaurant: 4,
  poke_restaurant: 4,
  seafood_restaurant: 3,
  mediterranean_restaurant: 4,
  greek_restaurant: 4,
  thai_restaurant: 3,
  vietnamese_restaurant: 3,
  indian_restaurant: 3,
  cafe: 3,
  coffee_shop: 3,
  breakfast_restaurant: 3,
  brunch_restaurant: 3,
  fast_food_restaurant: 2,
  hamburger_restaurant: 2,
  pizza_restaurant: 2,
  steak_house: 2,
  ice_cream_shop: 2,
  bakery: 2,
  bar: 2,
  dessert_restaurant: 2,
};

const LIGHT_MEAL_TYPES = new Set([
  'salad_shop',
  'poke_restaurant',
  'sushi_restaurant',
  'japanese_restaurant',
  'seafood_restaurant',
]);

const HEAVY_TYPES = new Set(['fast_food_restaurant', 'pizza_restaurant', 'hamburger_restaurant']);

const SHARING_CUISINES = new Set([
  'korean_restaurant',
  'japanese_restaurant',
  'spanish_restaurant',
  'tapas_restaurant',
  'chinese_restaurant',
  'thai_restaurant',
]);

const INTIMATE_SOLO = new Set(['cafe', 'coffee_shop', 'sandwich_shop', 'ramen_restaurant', 'sushi_restaurant']);

const COMFORT_MOOD_TYPES = new Set([
  'american_restaurant',
  'hamburger_restaurant',
  'pizza_restaurant',
  'italian_restaurant',
  'steak_house',
  'barbecue_restaurant',
  'fast_food_restaurant',
]);

const RAW_LIGHT_MOOD = new Set(['salad_shop', 'poke_restaurant', 'sushi_restaurant', 'juice_shop', 'acai_shop']);

const MEAL_PRIMARY_BONUS: Partial<Record<string, Partial<Record<MealTypeContext, number>>>> = {
  breakfast_restaurant: { breakfast: 15, lunch: 4, snack: 2, dinner: -5, late_night: -8 },
  brunch_restaurant: { breakfast: 12, lunch: 12, snack: 6, dinner: 0, late_night: -5 },
  cafe: { breakfast: 10, lunch: 6, snack: 15, dinner: 4, late_night: 6 },
  coffee_shop: { breakfast: 12, lunch: 4, snack: 15, dinner: 2, late_night: 8 },
  fast_food_restaurant: { breakfast: 5, lunch: 6, snack: 8, dinner: 6, late_night: 10 },
  bar: { breakfast: -15, lunch: -10, snack: 0, dinner: 10, late_night: 12 },
  fine_dining_restaurant: { breakfast: -12, lunch: -10, snack: -8, dinner: 12, late_night: 4 },
  restaurant: { breakfast: 0, lunch: 2, snack: 2, dinner: 4, late_night: 2 },
};

function mealModifierForPrimary(primary: string, meal: MealTypeContext): number {
  const map = MEAL_PRIMARY_BONUS[primary];
  if (map && map[meal] != null) return map[meal]!;
  if (meal === 'breakfast' && (primary.includes('breakfast') || primary.includes('brunch'))) return 12;
  if (meal === 'dinner' && primary.includes('steak')) return 6;
  return 0;
}

function rawCheapnessScore(place: any): number {
  switch (place?.priceLevel) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 93;
    case 'PRICE_LEVEL_MODERATE':
      return 58;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 26;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 7;
    default:
      return 52;
  }
}

function rawPriceScore(place: any, ratingRaw: number, costPreference: ImportanceLevel): number {
  const cheap = rawCheapnessScore(place);
  const expensiveness = Math.max(0, Math.min(1, (100 - cheap) / 93));
  const ratingGate = cheap + expensiveness * (ratingRaw - cheap) * 0.72;
  const gated = Math.max(0, Math.min(100, ratingGate));

  const cheapBias = importanceToStrength(costPreference);
  if (cheapBias <= 0) return gated;
  return gated * (1 - cheapBias) + cheap * cheapBias;
}

const NORM_WEIGHT_KEYS = [
  'speed',
  'cost',
  'distance',
  'health',
  'valueForMoney',
  'cuisine',
  'taste',
  'ratingAdherence',
] as const satisfies readonly (keyof RecommendationWeights)[];

const NEUTRAL_BLEND: Record<(typeof NORM_WEIGHT_KEYS)[number], number> = {
  distance: 0.2,
  speed: 0.08,
  cost: 0.12,
  health: 0.12,
  valueForMoney: 0.02,
  taste: 0.1,
  ratingAdherence: 0.22,
  cuisine: 0.1,
};

function importanceToStrength(level: ImportanceLevel): number {
  switch (level) {
    case 1:
      return 0;
    case 2:
      return 0.18;
    case 3:
      return 0.42;
    case 4:
      return 0.62;
    case 5:
      return 1;
    default:
      return 0;
  }
}

function normalizedStrengths(w: RecommendationWeights): Record<(typeof NORM_WEIGHT_KEYS)[number], number> {
  const keys = NORM_WEIGHT_KEYS;
  const raw = keys.map(k => k === 'valueForMoney' ? 0.02 : importanceToStrength(w[k]));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...NEUTRAL_BLEND };
  return Object.fromEntries(keys.map((k, i) => [k, raw[i]! / sum])) as Record<(typeof NORM_WEIGHT_KEYS)[number], number>;
}

function caloriePreferenceContribution(calorieDensity: number, level: ImportanceLevel): number {
  if (level === 3) return 0;
  const centered = (calorieDensity - 50) / 50;
  if (level < 3) {
    const intensity = level === 1 ? 0.12 : 0.4;
    return -centered * intensity * 34;
  }
  const intensity = level === 4 ? 0.38 : 1;
  return centered * intensity * 34;
}

type MetricHit = { strength: number; rawScore: number };

function calorieSynergyStrength(level: ImportanceLevel): number {
  if (level === 3) return 0;
  return importanceToStrength(level);
}

function calorieSynergyFit(calorieRaw: number, level: ImportanceLevel): number {
  if (level === 3) return 50;
  return level < 3 ? 100 - calorieRaw : calorieRaw;
}

function synergyBonus(hits: MetricHit[]): number {
  const strong = hits.filter(h => h.strength >= 0.55 && h.rawScore >= 62);
  if (strong.length < 2) return 0;
  const avgExcess = strong.reduce((s, h) => s + (h.rawScore - 62), 0) / strong.length;
  const avgStrength = strong.reduce((s, h) => s + h.strength, 0) / strong.length;
  const stack = (strong.length - 1) * 4.2 + avgExcess * 0.14 * avgStrength;
  return Math.min(16, stack);
}

function aiOf(place: any): AiOverview | undefined {
  return place?.aiOverview as AiOverview | undefined;
}

function aiScore0to10(ai: AiOverview | undefined, key: keyof AiOverview, fallback: number): number {
  const v = ai?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(10, v)) * 10 : fallback;
}

function aiScore0to5(ai: AiOverview | undefined, key: keyof AiOverview, fallback: number): number {
  const v = ai?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(5, v)) * 20 : fallback;
}

function hardExcludeClosed(place: any): boolean {
  return !isOpenNow(place);
}

function rawDistanceScore(distanceMeters: number, radiusMeters: number): number {
  if (!Number.isFinite(distanceMeters) || radiusMeters <= 0) return 0;
  const t = Math.min(1, Math.max(0, distanceMeters / radiusMeters));
  return 100 * Math.pow(1 - t, 1.4);
}

function rawHealthScore(place: any): number {
  const pt = String(place?.primaryType || 'restaurant').toLowerCase();
  const base = HEALTH_BASE[pt] ?? 3;
  let score = base * 20;
  if (place?.servesVegetarianFood === true) score += 10;
  if (LIGHT_MEAL_TYPES.has(pt)) score += 5;
  if (HEAVY_TYPES.has(pt)) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function rawRatingScore(place: any): number {
  const r = typeof place?.rating === 'number' ? place.rating : 0;
  if (r === 0) return 0;
  const rawScore = (r / 5) * 100;
  const conf = ratingConfidenceCurve(place?.userRatingCount);
  const baseline = 83; // 4.15 / 5 * 100
  return conf * rawScore + (1 - conf) * baseline;
}

function rawSpeedScore(place: any): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to5(ai, 'speedScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  const pt = String(place?.primaryType || '').toLowerCase();
  let score = 45;
  if (pt.includes('fast')) score = 85;
  if (place?.takeout === true) score += 12;
  if (pt.includes('fine_dining')) score = 25;
  return Math.max(0, Math.min(100, score));
}

function rawValueForMoneyScore(place: any, ratingRaw: number): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to5(ai, 'valueForMoneyScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  const cheap = rawCheapnessScore(place);
  const expensiveness = Math.max(0, Math.min(1, (100 - cheap) / 93));
  const value = cheap + expensiveness * (ratingRaw - cheap) * 0.9; // Better rating increases value of expensive places
  return Math.max(0, Math.min(100, value));
}

function rawCalorieScore(place: any): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to10(ai, 'calorieScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  const pt = String(place?.primaryType || '').toLowerCase();
  if (LIGHT_MEAL_TYPES.has(pt)) return 25;
  if (HEAVY_TYPES.has(pt)) return 75;
  return 50;
}

function rawTasteScore(place: any): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to5(ai, 'tasteScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  return 50;
}

function rawCuisineFitScore(place: any, favoriteCuisines: string[]): number {
  const rankIdx = bestFavoriteCuisineRankIndex(place, favoriteCuisines);
  return rankIdx == null ? 35 : cuisineFitScoreForRank(rankIdx);
}

function groupModifier(place: any, group: SessionGroupChip): number {
  const pt = String(place?.primaryType || '').toLowerCase();
  const big = group === 'small_group' || group === 'big_group';
  const solo = group === 'solo';

  let m = 0;
  if (big) {
    if (place?.goodForGroups === true) m += 15;
    if (place?.goodForGroups === false) m -= 20;
    if (SHARING_CUISINES.has(pt)) m += 10;
  }
  if (solo) {
    if (INTIMATE_SOLO.has(pt)) m += 10;
    if (place?.goodForGroups === true && !INTIMATE_SOLO.has(pt)) m -= 5;
  }
  return m;
}

function moodModifier(place: any, mood: SessionMood | null, favoriteCuisines: string[]): number {
  if (!mood) return 0;
  const pt = String(place?.primaryType || '').toLowerCase();
  const fav = placeMatchesFavoriteCuisine(place, favoriteCuisines);

  switch (mood) {
    case 'comfort':
      if (COMFORT_MOOD_TYPES.has(pt)) return 20;
      if (RAW_LIGHT_MOOD.has(pt)) return -10;
      return 0;
    case 'light':
      if (RAW_LIGHT_MOOD.has(pt) || pt.includes('mediterranean')) return 20;
      if (HEAVY_TYPES.has(pt)) return -15;
      return 0;
    case 'adventurous':
      if (fav) return -10;
      return 20;
    case 'quick':
      if (pt.includes('fast')) return 15;
      if (pt.includes('fine_dining')) return -20;
      if (place?.takeout === true) return 10;
      return 4;
    case 'special': {
      const pl = place?.priceLevel || '';
      let m = 0;
      if (pl === 'PRICE_LEVEL_EXPENSIVE' || pl === 'PRICE_LEVEL_VERY_EXPENSIVE') m += 20;
      if (place?.reservable === true) m += 15;
      if (HEAVY_TYPES.has(pt)) m -= 20;
      return m;
    }
    default:
      return 0;
  }
}

function timeFreshnessModifier(place: any, meal: MealTypeContext, weekendDinnerLive: boolean): number {
  let m = 0;
  const periods = place?.currentOpeningHours?.periods;
  if (Array.isArray(periods) && periods.length > 0) {
    const now = Date.now();
    const openTs = periods[0]?.open?.time;
    if (typeof openTs === 'string' && openTs.length >= 4) {
      const oh = parseInt(openTs.slice(0, 2), 10);
      const om = parseInt(openTs.slice(2), 10);
      if (!Number.isNaN(oh)) {
        const openDate = new Date();
        openDate.setHours(oh, om || 0, 0, 0);
        const mins = (now - openDate.getTime()) / 60000;
        if (mins >= 0 && mins <= 120) m += 5;
      }
    }
  }

  if (weekendDinnerLive && place?.liveMusic === true) m += 10;
  return m;
}

export function isCafeOrDrinkPlace(place: any): boolean {
  const pt = String(place?.primaryType || '').toLowerCase();
  const types = Array.isArray(place?.types) ? place.types.map((t: any) => String(t).toLowerCase()) : [];
  const cafeTypes = ['cafe', 'coffee_shop', 'bakery', 'bar', 'night_club', 'tea_house', 'ice_cream_shop', 'juice_shop', 'dessert_shop', 'dessert_restaurant'];
  if (cafeTypes.includes(pt)) return true;
  if (types.some((t: string) => cafeTypes.includes(t)) && !types.some((t: string) => t.includes('restaurant') || t === 'meal_takeaway' || t === 'meal_delivery' || t === 'food')) {
    return true;
  }
  return false;
}

function intentModifier(place: any, intent: LaunchIntentCategory | null): number {
  if (!intent) return 0;
  const pt = String(place?.primaryType || '').toLowerCase();
  const isCafe = isCafeOrDrinkPlace(place);
  
  if (intent === 'cafe_drinks') {
    if (isCafe) return 35;
    return -50;
  }

  // For any meal category (nice_meal, quick_casual, health_macros), food places take heavy precedence over cafes
  let baseIntentScore = isCafe ? -55 : 15;

  if (intent === 'nice_meal') {
    const pl = place?.priceLevel;
    if (['fine_dining_restaurant', 'steak_house', 'seafood_restaurant'].includes(pt)) return baseIntentScore + 25;
    if (pl === 'PRICE_LEVEL_EXPENSIVE' || pl === 'PRICE_LEVEL_VERY_EXPENSIVE') return baseIntentScore + 20;
    if (['fast_food_restaurant', 'hamburger_restaurant'].includes(pt)) return baseIntentScore - 25;
    return baseIntentScore;
  }
  if (intent === 'quick_casual') {
    if (['fast_food_restaurant', 'sandwich_shop', 'hamburger_restaurant', 'pizza_restaurant'].includes(pt)) return baseIntentScore + 25;
    if (place?.takeout === true) return baseIntentScore + 10;
    const pl = place?.priceLevel;
    if (pl === 'PRICE_LEVEL_EXPENSIVE' || pl === 'PRICE_LEVEL_VERY_EXPENSIVE') return baseIntentScore - 25;
    return baseIntentScore;
  }
  if (intent === 'health_macros') {
    const ai = place?.aiOverview;
    const fromAi = typeof ai?.healthScore === 'number' ? ai.healthScore : 0;
    if (fromAi >= 8) return baseIntentScore + 25;
    if (['salad_shop', 'vegetarian_restaurant', 'vegan_restaurant', 'juice_shop'].includes(pt)) return baseIntentScore + 20;
    if (['fast_food_restaurant', 'bar', 'dessert_restaurant'].includes(pt)) return baseIntentScore - 25;
    return baseIntentScore;
  }
  return baseIntentScore;
}

function buildMatchPills(sr: Omit<ScoredRestaurant, 'matchPills'>): ScoredRestaurant['matchPills'] {
  const cands: { kind: MatchPillKind; emoji: string; label: string; score: number }[] = [
    { kind: 'distance', emoji: '📍', label: 'Close by', score: sr.weightedParts.distance },
    { kind: 'health', emoji: '💚', label: 'Healthy pick', score: sr.weightedParts.health },
    { kind: 'value', emoji: '💸', label: 'Great value', score: sr.weightedParts.price },
    { kind: 'rating', emoji: '⭐', label: 'Highly rated', score: sr.weightedParts.rating },
    { kind: 'novelty', emoji: '🎲', label: 'Something new', score: sr.weightedParts.novelty },
  ];

  if (sr.modifiers.group >= 10) {
    cands.push({ kind: 'groups', emoji: '👥', label: 'Great for groups', score: sr.modifiers.group + 40 });
  }
  if (sr.modifiers.time >= 8) {
    cands.push({ kind: 'tonight', emoji: '🌙', label: 'Great tonight', score: sr.modifiers.time + 35 });
  }
  if (Math.abs(sr.modifiers.mood) >= 12) {
    cands.push({ kind: 'vibe', emoji: '🎭', label: 'Fits the vibe', score: 50 + Math.abs(sr.modifiers.mood) });
  }

  cands.sort((a, b) => b.score - a.score);
  const out: ScoredRestaurant['matchPills'] = [];
  const seen = new Set<MatchPillKind>();
  for (const c of cands) {
    if (seen.has(c.kind)) continue;
    seen.add(c.kind);
    out.push({ kind: c.kind, emoji: c.emoji, label: c.label });
    if (out.length >= 3) break;
  }
  return out;
}

export function applyRerollDiversityQueue(ranked: ScoredRestaurant[], maxSamePrimary: number, maxLen: number): ScoredRestaurant[] {
  if (ranked.length <= 1) return [];
  const remaining = ranked.slice(1);
  const out: ScoredRestaurant[] = [];
  const typeCount = new Map<string, number>();
  const typeKey = (s: ScoredRestaurant) => String(s.place?.primaryType || 'unknown');

  while (out.length < maxLen && remaining.length > 0) {
    let pickIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!;
      const k = typeKey(c);
      if ((typeCount.get(k) ?? 0) < maxSamePrimary) {
        pickIdx = i;
        break;
      }
    }
    if (pickIdx < 0) pickIdx = 0;
    const [chosen] = remaining.splice(pickIdx, 1);
    if (!chosen) break;
    out.push(chosen);
    const k = typeKey(chosen);
    typeCount.set(k, (typeCount.get(k) ?? 0) + 1);
  }
  return out;
}

export type ScoreContextInput = {
  prefs: RecommendationPrefsV1;
  session: SessionOverrides;
  userLat: number;
  userLng: number;
  rainyWeather?: boolean;
  includeClosed?: boolean;
};

export function scoreRestaurantPool(places: any[], ctx: ScoreContextInput): ScoredRestaurant[] {
  const { prefs, session, rainyWeather } = ctx;
  const nw = normalizedStrengths(prefs.weights);
  const w = prefs.weights;
  const radius = session.radiusMeters;
  const weekend = [0, 6].includes(new Date().getDay());
  const weekendDinner = weekend && (session.mealType === 'dinner' || session.mealType === 'late_night');

  const filtered = places.filter(place => {
    if (String(place?.businessStatus || 'OPERATIONAL') === 'CLOSED_PERMANENTLY') return false;
    if (!ctx.includeClosed) {
      if (String(place?.businessStatus || 'OPERATIONAL') !== 'OPERATIONAL') return false;
      if (hardExcludeClosed(place)) return false;
    }
    const dm = typeof place?.distanceMeters === 'number' ? place.distanceMeters : Infinity;
    if (!Number.isFinite(dm) || dm > radius) return false;
    return true;
  });

  const scored: ScoredRestaurant[] = filtered.map(place => {
    const dm = place.distanceMeters as number;
    const dRaw = rawDistanceScore(dm, radius);
    const hRaw = rawHealthScore(place);
    const ratingRaw = rawRatingScore(place);
    const pRaw = rawPriceScore(place, ratingRaw, w.cost);
    const speedRaw = rawSpeedScore(place);
    const valueRaw = rawValueForMoneyScore(place, ratingRaw);
    const calorieRaw = rawCalorieScore(place);
    const tasteRaw = rawTasteScore(place);
    const cuisineFitRaw = rawCuisineFitScore(place, prefs.favoriteCuisines);
    const calorieContrib = caloriePreferenceContribution(calorieRaw, prefs.weights.calories);

    const healthBlend = hRaw * 0.7 + calorieRaw * 0.3;

    const mealM = mealModifierForPrimary(String(place?.primaryType || 'restaurant').toLowerCase(), session.mealType);
    const groupM = groupModifier(place, session.groupSize);
    const moodM = moodModifier(place, session.sessionMood, prefs.favoriteCuisines);
    const timeM = timeFreshnessModifier(place, session.mealType, weekendDinner);
    const intentM = intentModifier(place, getLaunchIntent());

    let rainM = 0;
    if (rainyWeather && place?.dineIn === true) {
      const pt = String(place?.primaryType || '').toLowerCase();
      if (COMFORT_MOOD_TYPES.has(pt) || pt.includes('italian')) rainM += 8;
    }

    const modifiers = {
      meal: mealM,
      group: groupM,
      mood: moodM,
      time: timeM + rainM,
      intent: intentM,
    };

    const weightedParts = {
      distance: dRaw * nw.distance + speedRaw * nw.speed,
      health: hRaw * nw.health + calorieContrib,
      price: pRaw * nw.cost + valueRaw * nw.valueForMoney,
      rating: tasteRaw * nw.taste + ratingRaw * nw.ratingAdherence,
      novelty: cuisineFitRaw * nw.cuisine,
    };

    const synergy = synergyBonus([
      { strength: importanceToStrength(w.distance), rawScore: dRaw },
      { strength: importanceToStrength(w.speed), rawScore: speedRaw },
      { strength: importanceToStrength(w.cost), rawScore: pRaw },
      { strength: importanceToStrength(w.health), rawScore: hRaw },
      { strength: importanceToStrength(w.valueForMoney), rawScore: valueRaw },
      { strength: importanceToStrength(w.taste), rawScore: tasteRaw },
      { strength: importanceToStrength(w.ratingAdherence), rawScore: ratingRaw },
      { strength: importanceToStrength(w.cuisine), rawScore: cuisineFitRaw },
      ...(w.calories !== 3
        ? [{ strength: calorieSynergyStrength(w.calories), rawScore: calorieSynergyFit(calorieRaw, w.calories) }]
        : []),
    ]);

    let mismatchPenalty = 0;
    const checkMismatch = (strength: number, rawScore: number) => {
      if (strength > 0.4 && rawScore < 45) {
        mismatchPenalty += (45 - rawScore) * strength * 1.5;
      }
    };
    checkMismatch(importanceToStrength(w.distance), dRaw);
    checkMismatch(importanceToStrength(w.speed), speedRaw);
    checkMismatch(importanceToStrength(w.cost), pRaw);
    checkMismatch(importanceToStrength(w.health), hRaw);
    checkMismatch(importanceToStrength(w.valueForMoney), valueRaw);
    checkMismatch(importanceToStrength(w.taste), tasteRaw);
    checkMismatch(importanceToStrength(w.ratingAdherence), ratingRaw);
    checkMismatch(importanceToStrength(w.cuisine), cuisineFitRaw);

    const base =
      weightedParts.distance +
      weightedParts.health +
      weightedParts.price +
      weightedParts.rating +
      weightedParts.novelty;

    let plateboundScore = Math.max(0, Math.min(100, base + synergy + modifiers.meal + modifiers.group + modifiers.mood + modifiers.time + (modifiers as any).intent - mismatchPenalty));
    
    // Curving function: range from 75 to 98
    const t = Math.max(0, Math.min(1, plateboundScore / 100));
    plateboundScore = 75 + Math.pow(t, 0.65) * 23;
    plateboundScore = Math.max(75, Math.min(98, plateboundScore));

    const raw = {
      distance: dRaw,
      health: healthBlend,
      price: pRaw,
      rating: ratingRaw,
      novelty: cuisineFitRaw,
    };
    const baseSr: Omit<ScoredRestaurant, 'matchPills'> = {
      place,
      plateboundScore,
      raw,
      weightedParts,
      modifiers,
    };
    return { ...baseSr, matchPills: buildMatchPills(baseSr) };
  });

  const activeIntent = getLaunchIntent();
  scored.sort((a, b) => {
    if (activeIntent) {
      const aIsCafe = isCafeOrDrinkPlace(a.place);
      const bIsCafe = isCafeOrDrinkPlace(b.place);
      if (activeIntent === 'cafe_drinks') {
        if (aIsCafe !== bIsCafe) return aIsCafe ? -1 : 1;
      } else {
        // Meal categories: food places come first
        if (aIsCafe !== bIsCafe) return !aIsCafe ? -1 : 1;
      }
    }
    return b.plateboundScore - a.plateboundScore;
  });
  return scored;
}

export async function scoreWithLoadedPrefs(
  places: any[],
  session: SessionOverrides,
  userLat: number,
  userLng: number,
  rainyWeather?: boolean,
  includeClosed?: boolean
): Promise<ScoredRestaurant[]> {
  const prefs = await getRecommendationPrefs();
  return scoreRestaurantPool(places, { prefs, session, userLat, userLng, rainyWeather, includeClosed });
}
