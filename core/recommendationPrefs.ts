import AsyncStorage from '@react-native-async-storage/async-storage';

import { TOP_CUISINE_TILES } from './recommendationCuisines';
import {
  DEFAULT_PREFS_V1,
  type DefaultGroupSize,
  type DefaultRadiusId,
  type DietaryFilterId,
  type RecommendationPrefsV1,
  type RecommendationWeights,
} from './recommendationTypes';

const TOP_CUISINE_IDS = new Set(TOP_CUISINE_TILES.map(t => t.id));

const STORAGE_KEY = 'recommendation_prefs_v1';

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeWeights(w: Partial<RecommendationWeights> | undefined): RecommendationWeights {
  const d = DEFAULT_PREFS_V1.weights;
  const pick = (x: number | undefined) => clamp(typeof x === 'number' && Number.isFinite(x) ? x : 50, 0, 100);
  return {
    distance: pick(w?.distance),
    health: pick(w?.health),
    price: pick(w?.price),
    rating: pick(w?.rating),
    novelty: pick(w?.novelty),
  };
}

function sanitizeDietary(raw: unknown): DietaryFilterId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>([
    'vegetarian',
    'vegan',
    'halal',
    'kosher',
    'gluten_free',
    'dairy_free',
    'nut_allergy',
  ]);
  return raw.filter((x): x is DietaryFilterId => typeof x === 'string' && allowed.has(x));
}

function sanitizeGroupSize(x: unknown): DefaultGroupSize {
  const s = ['solo', 'partner', 'small_group', 'big_group', 'varies'];
  return s.includes(x as string) ? (x as DefaultGroupSize) : 'solo';
}

function sanitizeRadius(x: unknown): DefaultRadiusId {
  const s = ['walking', 'short_drive', 'worth_trip'];
  return s.includes(x as string) ? (x as DefaultRadiusId) : 'short_drive';
}

function sanitizeFavoriteCuisines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREFS_V1.favoriteCuisines];
  const out = raw.filter((x): x is string => typeof x === 'string' && TOP_CUISINE_IDS.has(x));
  return out.length > 0 ? out : [...DEFAULT_PREFS_V1.favoriteCuisines];
}

export function mergeRecommendationPrefs(raw: Partial<RecommendationPrefsV1> | null): RecommendationPrefsV1 {
  if (!raw || raw.v !== 1) return { ...DEFAULT_PREFS_V1 };
  return {
    v: 1,
    onboardingComplete: !!raw.onboardingComplete,
    defaultGroupSize: sanitizeGroupSize(raw.defaultGroupSize),
    weights: sanitizeWeights(raw.weights),
    dietaryFilters: sanitizeDietary(raw.dietaryFilters),
    budgetCeiling: clamp(
      typeof raw.budgetCeiling === 'number' && Number.isFinite(raw.budgetCeiling) ? raw.budgetCeiling : 20,
      5,
      100
    ),
    favoriteCuisines: sanitizeFavoriteCuisines(raw.favoriteCuisines),
    defaultRadius: sanitizeRadius(raw.defaultRadius),
    openNowOnly: !!raw.openNowOnly,
    minimumRatingThreshold: clamp(
      typeof raw.minimumRatingThreshold === 'number' && Number.isFinite(raw.minimumRatingThreshold)
        ? raw.minimumRatingThreshold
        : 3.5,
      1,
      5
    ),
    noveltyPressure: clamp(
      typeof raw.noveltyPressure === 'number' && Number.isFinite(raw.noveltyPressure) ? raw.noveltyPressure : 50,
      0,
      100
    ),
    penalizeRepeats: raw.penalizeRepeats !== false,
    cuisineRepeatWindowDays: clamp(
      typeof raw.cuisineRepeatWindowDays === 'number' && Number.isFinite(raw.cuisineRepeatWindowDays)
        ? Math.round(raw.cuisineRepeatWindowDays)
        : 7,
      1,
      30
    ),
  };
}

export async function getRecommendationPrefs(): Promise<RecommendationPrefsV1> {
  try {
    const s = await AsyncStorage.getItem(STORAGE_KEY);
    if (!s) return { ...DEFAULT_PREFS_V1 };
    const parsed = JSON.parse(s) as Partial<RecommendationPrefsV1>;
    return mergeRecommendationPrefs(parsed);
  } catch {
    return { ...DEFAULT_PREFS_V1 };
  }
}

export async function saveRecommendationPrefs(prefs: RecommendationPrefsV1): Promise<void> {
  const merged = mergeRecommendationPrefs(prefs);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export async function markOnboardingComplete(partial?: Partial<RecommendationPrefsV1>): Promise<void> {
  const cur = await getRecommendationPrefs();
  await saveRecommendationPrefs({
    ...mergeRecommendationPrefs({ ...cur, ...partial, onboardingComplete: true }),
    onboardingComplete: true,
  });
}

export async function resetRecommendationPrefsToOnboarding(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_PREFS_V1 }));
}
