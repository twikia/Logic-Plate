import type { AiOverview } from './aiOverviewCache';
import { isOpenNow } from './isOpenNow';
import {
  bestFavoriteCuisineRankIndex,
  cuisineFitScoreForRank,
  placeMatchesFavoriteCuisine,
} from './recommendationCuisines';
import { getRecommendationPrefs } from './recommendationPrefs';
import type { RecommendationWeights } from './recommendationTypes';
import type {
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

function priceLevelToDollars(level?: string | null): number {
  switch (level) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 10;
    case 'PRICE_LEVEL_MODERATE':
      return 22;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 45;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 75;
    default:
      return 25;
  }
}

function normWeights(w: RecommendationWeights) {
  const keys = [
    'speed',
    'cost',
    'distance',
    'health',
    'workoutRecovery',
    'protein',
    'calories',
    'cuisine',
    'cuisineVariety',
    'cuisineAdherence',
    'taste',
    'ratingAdherence',
  ] as const;
  const vals = keys.map(k => Math.max(0, w[k]));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const eq = 1 / keys.length;
    return Object.fromEntries(keys.map(k => [k, eq])) as Record<(typeof keys)[number], number>;
  }
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]! / sum])) as Record<(typeof keys)[number], number>;
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
  return 100 * (1 - t);
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

function rawPriceScore(place: any, budgetCeiling: number): number {
  const est = priceLevelToDollars(place?.priceLevel);
  const ratio = est / Math.max(5, budgetCeiling);
  if (ratio <= 0.85) return 95;
  if (ratio <= 1) return 72;
  if (ratio <= 1.35) return 42;
  if (ratio <= 1.8) return 22;
  return 10;
}

function rawRatingScore(place: any): number {
  const r = typeof place?.rating === 'number' ? place.rating : 0;
  return (r / 5) * 100;
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

function rawWorkoutRecoveryScore(place: any): number {
  const ai = aiOf(place);
  return aiScore0to10(ai, 'workoutRecoveryScore', rawHealthScore(place) * 0.75);
}

function rawProteinScore(place: any): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to5(ai, 'proteinScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  const pt = String(place?.primaryType || '').toLowerCase();
  if (pt.includes('steak') || pt.includes('seafood') || pt === 'poke_restaurant') return 78;
  if (pt.includes('salad') || pt === 'juice_shop') return 55;
  if (HEAVY_TYPES.has(pt)) return 35;
  return 50;
}

function rawCalorieScore(place: any): number {
  const ai = aiOf(place);
  const fromAi = aiScore0to10(ai, 'calorieScore', NaN);
  if (Number.isFinite(fromAi)) return fromAi;
  const pt = String(place?.primaryType || '').toLowerCase();
  if (LIGHT_MEAL_TYPES.has(pt)) return 82;
  if (HEAVY_TYPES.has(pt)) return 35;
  return 55;
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

function rawCuisineVarietyScore(place: any, favoriteCuisines: string[]): number {
  return placeMatchesFavoriteCuisine(place, favoriteCuisines) ? 22 : 85;
}

function rawCuisineCompositeScore(
  place: any,
  favoriteCuisines: string[],
  weights: RecommendationWeights
): number {
  const fit = rawCuisineFitScore(place, favoriteCuisines);
  const variety = rawCuisineVarietyScore(place, favoriteCuisines);
  const adherenceP = (weights.cuisineAdherence - 1) / 4;
  const varietyP = (weights.cuisineVariety - 1) / 4;
  const cuisineP = (weights.cuisine - 1) / 4;
  let score = fit * adherenceP * (0.35 + cuisineP * 0.65) + variety * varietyP * (0.35 + cuisineP * 0.35);
  if (adherenceP < 0.15 && varietyP < 0.15) {
    score = fit * 0.5 + variety * 0.5;
  }
  return Math.max(0, Math.min(100, score));
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
};

export function scoreRestaurantPool(places: any[], ctx: ScoreContextInput): ScoredRestaurant[] {
  const { prefs, session, rainyWeather } = ctx;
  const nw = normWeights(prefs.weights);
  const radius = session.radiusMeters;
  const weekend = [0, 6].includes(new Date().getDay());
  const weekendDinner = weekend && (session.mealType === 'dinner' || session.mealType === 'late_night');

  const filtered = places.filter(place => {
    if (String(place?.businessStatus || 'OPERATIONAL') !== 'OPERATIONAL') return false;
    if (hardExcludeClosed(place)) return false;
    const dm = typeof place?.distanceMeters === 'number' ? place.distanceMeters : Infinity;
    if (!Number.isFinite(dm) || dm > radius) return false;
    return true;
  });

  const scored: ScoredRestaurant[] = filtered.map(place => {
    const dm = place.distanceMeters as number;
    const dRaw = rawDistanceScore(dm, radius);
    const hRaw = rawHealthScore(place);
    const pRaw = rawPriceScore(place, session.budgetCeiling);
    const speedRaw = rawSpeedScore(place);
    const workoutRaw = rawWorkoutRecoveryScore(place);
    const proteinRaw = rawProteinScore(place);
    const calorieRaw = rawCalorieScore(place);
    const tasteRaw = rawTasteScore(place);
    const ratingRaw = rawRatingScore(place);
    const cuisineRaw = rawCuisineCompositeScore(place, prefs.favoriteCuisines, prefs.weights);

    const healthBlend =
      hRaw * 0.45 + workoutRaw * 0.2 + proteinRaw * 0.2 + calorieRaw * 0.15;

    const mealM = mealModifierForPrimary(String(place?.primaryType || 'restaurant').toLowerCase(), session.mealType);
    const groupM = groupModifier(place, session.groupSize);
    const moodM = moodModifier(place, session.sessionMood, prefs.favoriteCuisines);
    const timeM = timeFreshnessModifier(place, session.mealType, weekendDinner);

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
    };

    const weightedParts = {
      distance: dRaw * nw.distance + speedRaw * nw.speed,
      health: hRaw * nw.health + workoutRaw * nw.workoutRecovery + proteinRaw * nw.protein + calorieRaw * nw.calories,
      price: pRaw * nw.cost,
      rating: tasteRaw * nw.taste + ratingRaw * nw.ratingAdherence,
      novelty:
        cuisineRaw * nw.cuisine +
        rawCuisineVarietyScore(place, prefs.favoriteCuisines) * nw.cuisineVariety * 0.5 +
        rawCuisineFitScore(place, prefs.favoriteCuisines) * nw.cuisineAdherence * 0.5,
    };

    const base =
      weightedParts.distance +
      weightedParts.health +
      weightedParts.price +
      weightedParts.rating +
      weightedParts.novelty;

    const plateboundScore = Math.max(0, Math.min(100, base + modifiers.meal + modifiers.group + modifiers.mood + modifiers.time));

    const raw = {
      distance: dRaw,
      health: healthBlend,
      price: pRaw,
      rating: ratingRaw,
      novelty: cuisineRaw,
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

  scored.sort((a, b) => b.plateboundScore - a.plateboundScore);
  return scored;
}

export async function scoreWithLoadedPrefs(
  places: any[],
  session: SessionOverrides,
  userLat: number,
  userLng: number,
  rainyWeather?: boolean
): Promise<ScoredRestaurant[]> {
  const prefs = await getRecommendationPrefs();
  return scoreRestaurantPool(places, { prefs, session, userLat, userLng, rainyWeather });
}
