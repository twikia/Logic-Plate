import type { AiOverview } from './aiOverviewCache';
import { calculatePlateboundScore } from './ratingCalculator';
import {
  DEFAULT_RANDOM_AI_CUTOFFS,
  type RandomAiCutoffKey,
  type RandomSortBy,
} from './randomPickerState';

export const SORT_OPTIONS: { key: RandomSortBy; label: string }[] = [
  { key: 'distance', label: 'Distance' },
  { key: 'price', label: 'Price' },
  { key: 'rating', label: 'Rating' },
  { key: 'overall', label: 'Overall' },
  { key: 'health', label: 'Health' },
  { key: 'taste', label: 'Taste' },
  { key: 'valueForMoney', label: 'Value' },
  { key: 'speed', label: 'Speed' },
  { key: 'workoutRecovery', label: 'Recovery' },
  { key: 'munchy', label: 'Munchy' },
  { key: 'protein', label: 'Protein' },
  { key: 'calorie', label: 'Calories' },
  { key: 'dateWorthiness', label: 'Date' },
  { key: 'soloDiner', label: 'Solo diner' },
  { key: 'energySustain', label: 'Energy' },
];

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
  const r0 = 0xef;
  const g0 = 0x44;
  const b0 = 0x44;
  const r1 = 0x22;
  const g1 = 0xc5;
  const b1 = 0x5e;
  const r = Math.round(r0 + (r1 - r0) * u);
  const g = Math.round(g0 + (g1 - g0) * u);
  const b = Math.round(b0 + (b1 - b0) * u);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
