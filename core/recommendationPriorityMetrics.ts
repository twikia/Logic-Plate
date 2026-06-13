import type { ImportanceLevel, RecommendationWeights } from './recommendationTypes';

export type PriorityMetricKey = keyof RecommendationWeights;

export type PriorityMetricDef = {
  key: PriorityMetricKey;
  label: string;
  hint: string;
  icon: string;
};

export type PriorityMetricScreen = {
  id: 'practical' | 'health' | 'cuisine';
  title: string;
  subtitle: string;
  metrics: PriorityMetricDef[];
};

export const IMPORTANCE_LEVEL_EMOJIS: Record<ImportanceLevel, string> = {
  1: '💤',
  2: '🙂',
  3: '😊',
  4: '🔥',
  5: '⭐',
};

export const IMPORTANCE_LEVEL_LABELS: Record<ImportanceLevel, string> = {
  1: 'Barely',
  2: 'A little',
  3: 'Moderate',
  4: 'Important',
  5: 'Essential',
};

export const PRIORITY_METRIC_SCREENS: PriorityMetricScreen[] = [
  {
    id: 'practical',
    title: 'Practical priorities',
    subtitle: 'How much travel, cost, and speed matter when we pick.',
    metrics: [
      { key: 'speed', label: 'Speed', hint: 'Quick service and short waits', icon: '⚡' },
      { key: 'cost', label: 'Cost', hint: 'Staying within your budget', icon: '💰' },
      { key: 'distance', label: 'Distance', hint: 'How close the spot is', icon: '📍' },
      {
        key: 'ratingAdherence',
        label: 'Top rating importance',
        hint: 'How much star ratings matter when we pick',
        icon: '⭐',
      },
    ],
  },
  {
    id: 'health',
    title: 'Health & nutrition',
    subtitle: 'What you want from meals for your body and goals.',
    metrics: [
      { key: 'health', label: 'Health', hint: 'Wholesome, less processed picks', icon: '💚' },
      { key: 'workoutRecovery', label: 'Workout recovery', hint: 'Refuel after training', icon: '💪' },
      { key: 'protein', label: 'Protein', hint: 'Protein-forward menus', icon: '🥩' },
      { key: 'calories', label: 'Calories', hint: 'Calorie-aware choices', icon: '🔥' },
    ],
  },
  {
    id: 'cuisine',
    title: 'Taste & cuisine',
    subtitle: 'Flavor, variety, and how closely we stick to your favorites.',
    metrics: [
      { key: 'cuisine', label: 'Cuisine fit', hint: 'Overall cuisine match', icon: '🍽️' },
      { key: 'cuisineVariety', label: 'Cuisine variety', hint: 'Trying new cuisines', icon: '🎲' },
      {
        key: 'cuisineAdherence',
        label: 'Favorite cuisine adherence',
        hint: 'How strongly we favor your picked cuisines',
        icon: '❤️',
      },
      { key: 'taste', label: 'Taste', hint: 'AI flavor and menu quality', icon: '👅' },
    ],
  },
];

export function allPriorityMetricKeys(): PriorityMetricKey[] {
  return PRIORITY_METRIC_SCREENS.flatMap(s => s.metrics.map(m => m.key));
}
