import AsyncStorage from '@react-native-async-storage/async-storage';

import { allPriorityMetricKeys } from './recommendationPriorityMetrics';
import { MAX_CUISINE_RANKS } from './cuisineRanking';
import { TOP_CUISINE_TILES } from './recommendationCuisines';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type DefaultRadiusId,
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
    if (out.ratingAdherence === DEFAULT_WEIGHTS.ratingAdherence && legacy.rating != null) {
      out.ratingAdherence = legacyLevelFromHundred(legacy.rating, 3);
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

function sanitizeRadius(x: unknown): DefaultRadiusId {
  const s = ['walking', 'short_drive', 'worth_trip'];
  return s.includes(x as string) ? (x as DefaultRadiusId) : 'short_drive';
}

function sanitizeFavoriteCuisines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string' || !TOP_CUISINE_IDS.has(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= MAX_CUISINE_RANKS) break;
  }
  return out;
}

export function mergeRecommendationPrefs(raw: Partial<RecommendationPrefsV1> | null): RecommendationPrefsV1 {
  if (!raw || raw.v !== 1) return { ...DEFAULT_PREFS_V1 };
  const weights = sanitizeWeights(raw.weights);
  return {
    v: 1,
    onboardingComplete:
      typeof raw.onboardingComplete === 'boolean'
        ? raw.onboardingComplete
        : true,
    weights,
    favoriteCuisines: sanitizeFavoriteCuisines(raw.favoriteCuisines),
    defaultRadius: sanitizeRadius(raw.defaultRadius),
    openNowOnly: true,
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
