import type { ImportanceLevel, RecommendationWeights } from './recommendationTypes';

export type PriorityMetricKey = keyof RecommendationWeights;

export type PriorityMetricDef = {
  key: PriorityMetricKey;
  label: string;
  hint: string;
  icon: string;
  rangeLowLabel?: string;
  rangeHighLabel?: string;
};

export type PriorityMetricScreen = {
  id: 'practical' | 'health';
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
  1: 'Default',
  2: 'A little',
  3: 'Moderate',
  4: 'Nice to have',
  5: 'Top priority',
};

export const PRIORITY_METRIC_SCREENS: PriorityMetricScreen[] = [
  {
    id: 'practical',
    title: 'Practical priorities',
    subtitle: 'How much travel, cost, and speed matter when we pick.',
    metrics: [
      { key: 'speed', label: 'Speed', hint: 'Quick service and short waits', icon: '⚡' },
      { key: 'cost', label: 'Cost', hint: 'Favor cheaper restaurants when this matters to you', icon: '💰' },
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
      { key: 'valueForMoney', label: 'Value for money', hint: 'Great bang for your buck', icon: '🤑' },
      { key: 'taste', label: 'Taste', hint: 'AI flavor and menu quality', icon: '👅' },
      {
        key: 'calories',
        label: 'Calories',
        hint: 'How much calorie density should sway your picks',
        icon: '🔥',
        rangeLowLabel: 'Favor less calories',
        rangeHighLabel: 'Favor more calories',
      },
    ],
  },
];

export const CUISINE_FIT_METRIC: PriorityMetricDef = {
  key: 'cuisine',
  label: 'Cuisine fit',
  hint: 'How much to favor your favorites',
  icon: '🍽️',
};

export function allPriorityMetricKeys(): PriorityMetricKey[] {
  const keys = new Set<PriorityMetricKey>(
    PRIORITY_METRIC_SCREENS.flatMap(s => s.metrics.map(m => m.key))
  );
  keys.add(CUISINE_FIT_METRIC.key);
  return [...keys];
}
