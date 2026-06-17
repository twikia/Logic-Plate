import type { AiOverview } from './aiOverviewCache';
import { calculatePlateboundScore } from './ratingCalculator';
import {
  DEFAULT_RANDOM_AI_CUTOFFS,
  type RandomAiCutoffKey,
  type RandomSortBy,
} from './randomPickerState';

export const SORT_OPTION_KEYS: RandomSortBy[] = [
  'distance',
  'price',
  'rating',
  'overall',
  'health',
  'taste',
  'valueForMoney',
  'speed',
  'workoutRecovery',
  'munchy',
  'protein',
  'calorie',
  'dateWorthiness',
  'soloDiner',
  'energySustain',
];

/** @deprecated Use SORT_OPTION_KEYS with tSortLabel */
export const SORT_OPTIONS: { key: RandomSortBy }[] = SORT_OPTION_KEYS.map((key) => ({ key }));

export function getOverviewMetric(
  ai: AiOverview | undefined | null,
  key: RandomAiCutoffKey | 'health'
): number {
  if (!ai) return -1;
  switch (key) {
    case 'taste':
      return ai.tasteScore ?? -1;
    case 'valueForMoney':
      return ai.valueForMoneyScore ?? -1;
    case 'speed':
      return ai.speedScore ?? -1;
    case 'workoutRecovery':
      return ai.workoutRecoveryScore ?? -1;
    case 'munchy':
      return ai.munchyScore ?? -1;
    case 'protein':
      return ai.proteinScore ?? -1;
    case 'calorie':
      return ai.calorieScore ?? -1;
    case 'dateWorthiness':
      return ai.dateWorthiness ?? -1;
    case 'soloDiner':
      return ai.soloDinerScore ?? -1;
    case 'energySustain':
      return ai.energySustainScore ?? -1;
    case 'health':
      return typeof ai.healthScore === 'number' ? ai.healthScore : -1;
    default:
      return -1;
  }
}

export type RestaurantSortInput = {
  aiOverview?: AiOverview | null;
  rating?: number;
  priceLevel?: string;
  distanceMeters?: number;
};

export function getSortValue(r: RestaurantSortInput, sortBy: RandomSortBy): number {
  const ai = r.aiOverview ?? null;
  if (sortBy === 'overall') {
    return calculatePlateboundScore(ai, r.rating, r.priceLevel);
  }
  if (sortBy === 'distance') {
    return r.distanceMeters ?? 0;
  }
  if (sortBy === 'rating') {
    return r.rating ?? -1;
  }
  if (sortBy === 'price') {
    const priceLevels = [
      'PRICE_LEVEL_INEXPENSIVE',
      'PRICE_LEVEL_MODERATE',
      'PRICE_LEVEL_EXPENSIVE',
      'PRICE_LEVEL_VERY_EXPENSIVE',
    ];
    const idx = r.priceLevel ? priceLevels.indexOf(r.priceLevel) : -1;
    return idx === -1 ? 999 : idx;
  }
  if (sortBy === 'health' || (sortBy as string) in DEFAULT_RANDOM_AI_CUTOFFS) {
    return getOverviewMetric(ai, sortBy === 'health' ? 'health' : (sortBy as RandomAiCutoffKey));
  }
  return -1;
}

export function compareRestaurantsBySort(a: RestaurantSortInput, b: RestaurantSortInput, sortBy: RandomSortBy): number {
  if (sortBy === 'distance') {
    return (a.distanceMeters || 0) - (b.distanceMeters || 0);
  }
  if (sortBy === 'price') {
    return getSortValue(a, sortBy) - getSortValue(b, sortBy);
  }
  const va = getSortValue(a, sortBy);
  const vb = getSortValue(b, sortBy);
  return vb - va;
}

export function mapSortRawHigherIsGreener(
  r: RestaurantSortInput,
  sortBy: RandomSortBy
): number {
  if (sortBy === 'distance') {
    const d = r.distanceMeters;
    if (typeof d !== 'number' || !Number.isFinite(d)) return NaN;
    return -d;
  }
  if (sortBy === 'price') {
    const v = getSortValue(r, sortBy);
    if (v >= 999 || v < 0) return NaN;
    return 3 - v;
  }
  if (sortBy === 'rating') {
    const v = r.rating;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return NaN;
    return v;
  }
  if (sortBy === 'overall') {
    if (!r.aiOverview) return NaN;
    return getSortValue(r, sortBy);
  }
  const v = getSortValue(r, sortBy);
  if (v < 0 || !Number.isFinite(v)) return NaN;
  return v;
}

export function sortGoodness01(
  r: RestaurantSortInput,
  sortBy: RandomSortBy,
  radiusMeters: number
): number {
  if (sortBy === 'distance') {
    const d = r.distanceMeters ?? 0;
    const rad = Math.max(radiusMeters, 1);
    return Math.max(0, Math.min(1, 1 - d / rad));
  }
  if (sortBy === 'price') {
    const v = getSortValue(r, sortBy);
    if (v >= 999 || v < 0) return 0;
    return Math.max(0, Math.min(1, (3 - v) / 3));
  }
  if (sortBy === 'rating') {
    const v = getSortValue(r, sortBy);
    if (v < 0) return 0;
    return Math.max(0, Math.min(1, v / 5));
  }
  if (sortBy === 'overall') {
    const o = calculatePlateboundScore(r.aiOverview ?? null, r.rating, r.priceLevel);
    return Math.max(0, Math.min(1, o / 10));
  }
  if (sortBy === 'health' || sortBy === 'workoutRecovery') {
    const v = getSortValue(r, sortBy);
    if (v < 0) return 0;
    return Math.max(0, Math.min(1, v / 10));
  }
  const v = getSortValue(r, sortBy);
  if (v < 0) return 0;
  return Math.max(0, Math.min(1, v / 5));
}

export function lerpRedGreen(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const r0 = 0xff;
  const g0 = 0x00;
  const b0 = 0x00;
  const r1 = 0x00;
  const g1 = 0xd9;
  const b1 = 0x38;
  const r = Math.round(r0 + (r1 - r0) * u);
  const g = Math.round(g0 + (g1 - g0) * u);
  const b = Math.round(b0 + (b1 - b0) * u);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const MAP_MARKER_COLOR_STOPS = [
  { t: 0, r: 0xdc, g: 0x26, b: 0x26 },
  { t: 0.5, r: 0xd9, g: 0x77, b: 0x06 },
  { t: 1, r: 0x16, g: 0xa3, b: 0x4a },
] as const;

export function mapMarkerScoreColor(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < MAP_MARKER_COLOR_STOPS.length - 1 && u > MAP_MARKER_COLOR_STOPS[i + 1]!.t) i++;
  const a = MAP_MARKER_COLOR_STOPS[i]!;
  const b = MAP_MARKER_COLOR_STOPS[Math.min(i + 1, MAP_MARKER_COLOR_STOPS.length - 1)]!;
  const span = b.t - a.t || 1;
  const f = (b.t === a.t) ? 0 : (u - a.t) / span;
  const r = Math.round(a.r + (b.r - a.r) * f);
  const g = Math.round(a.g + (b.g - a.g) * f);
  const bl = Math.round(a.b + (b.b - a.b) * f);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(bl)}`;
}
