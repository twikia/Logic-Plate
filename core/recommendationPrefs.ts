import AsyncStorage from '@react-native-async-storage/async-storage';

import { allPriorityMetricKeys } from './recommendationPriorityMetrics';
import { TOP_CUISINE_TILES } from './recommendationCuisines';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type DefaultGroupSize,
  type DefaultRadiusId,
  type DietaryFilterId,
  type ImportanceLevel,
  type RecommendationPrefsV1,
  type RecommendationWeights,
} from './recommendationTypes';

const TOP_CUISINE_IDS = new Set(TOP_CUISINE_TILES.map(t => t.id));

const STORAGE_KEY = 'recommendation_prefs_v1';

const LEGACY_WEIGHT_KEYS = ['distance', 'health', 'price', 'rating', 'novelty'] as const;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function toImportanceLevel(x: unknown): ImportanceLevel | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const n = Math.round(x);
  if (n >= 1 && n <= 5) return n as ImportanceLevel;
  if (x > 5) {
    if (x <= 20) return 1;
    if (x <= 40) return 2;
    if (x <= 60) return 3;
    if (x <= 80) return 4;
    return 5;
  }
  return null;
}

function legacyLevelFromHundred(v: number | undefined, fallback: ImportanceLevel): ImportanceLevel {
  return toImportanceLevel(v) ?? fallback;
}

function sanitizeWeights(w: Partial<RecommendationWeights> | Record<string, unknown> | undefined): RecommendationWeights {
  const out = { ...DEFAULT_WEIGHTS };
  const raw = (w ?? {}) as Record<string, unknown>;

  for (const key of allPriorityMetricKeys()) {
    const level = toImportanceLevel(raw[key]);
    if (level != null) out[key] = level;
  }

  const legacy = raw as {
    distance?: number;
    health?: number;
    price?: number;
    rating?: number;
    novelty?: number;
  };
  const hasLegacy = LEGACY_WEIGHT_KEYS.some(k => typeof legacy[k] === 'number');
  if (hasLegacy) {
    if (out.distance === DEFAULT_WEIGHTS.distance && legacy.distance != null) {
      out.distance = legacyLevelFromHundred(legacy.distance, 3);
    }
    if (out.health === DEFAULT_WEIGHTS.health && legacy.health != null) {
      out.health = legacyLevelFromHundred(legacy.health, 3);
    }
    if (out.cost === DEFAULT_WEIGHTS.cost && legacy.price != null) {
      out.cost = legacyLevelFromHundred(legacy.price, 3);
    }
    if (out.taste === DEFAULT_WEIGHTS.taste && legacy.rating != null) {
      out.taste = legacyLevelFromHundred(legacy.rating, 3);
    }
    if (legacy.novelty != null) {
      const n = legacyLevelFromHundred(legacy.novelty, 3);
      if (out.cuisineVariety === DEFAULT_WEIGHTS.cuisineVariety) out.cuisineVariety = n;
      if (out.cuisineAdherence === DEFAULT_WEIGHTS.cuisineAdherence) {
        out.cuisineAdherence = (6 - n) as ImportanceLevel;
      }
    }
  }

  return out;
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

export function deriveNoveltyPressureFromWeights(weights: RecommendationWeights): number {
  return clamp(((weights.cuisineVariety - 1) / 4) * 100, 0, 100);
}

export function mergeRecommendationPrefs(raw: Partial<RecommendationPrefsV1> | null): RecommendationPrefsV1 {
  if (!raw || raw.v !== 1) return { ...DEFAULT_PREFS_V1 };
  const weights = sanitizeWeights(raw.weights);
  const noveltyFromWeights = deriveNoveltyPressureFromWeights(weights);
  return {
    v: 1,
    onboardingComplete: !!raw.onboardingComplete,
    defaultGroupSize: sanitizeGroupSize(raw.defaultGroupSize),
    weights,
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
      typeof raw.noveltyPressure === 'number' && Number.isFinite(raw.noveltyPressure)
        ? raw.noveltyPressure
        : noveltyFromWeights,
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
  const withDerived = {
    ...merged,
    noveltyPressure: deriveNoveltyPressureFromWeights(merged.weights),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(withDerived));
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
