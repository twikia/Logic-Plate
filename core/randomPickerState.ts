import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'random_picker_state_v1';

export const RANDOM_SORT_KEYS = [
  'distance',
  'price',
  'health',
  'rating',
  'overall',
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
] as const;

export type RandomSortBy = (typeof RANDOM_SORT_KEYS)[number];

export type RandomAiCutoffKey =
  | 'taste'
  | 'valueForMoney'
  | 'speed'
  | 'workoutRecovery'
  | 'munchy'
  | 'protein'
  | 'calorie'
  | 'dateWorthiness'
  | 'soloDiner'
  | 'energySustain';

export type RandomAiCutoffs = Record<RandomAiCutoffKey, number>;

export const DEFAULT_RANDOM_AI_CUTOFFS: RandomAiCutoffs = {
  taste: 0,
  valueForMoney: 0,
  speed: 0,
  workoutRecovery: 0,
  munchy: 0,
  protein: 0,
  calorie: 0,
  dateWorthiness: 0,
  soloDiner: 0,
  energySustain: 0,
};

export type RandomPickerPersisted = {
  v: 1;
  filter: string;
  openOnly: boolean;
  selectedPrices: string[];
  minRating: number;
  selectedCuisines: string[];
  sortBy: RandomSortBy;
  selectedIds: string[];
  scenarioKey?: string | null;
  scenarioFilterEnabled?: boolean;
  minAiCutoffs?: Partial<RandomAiCutoffs>;
};

export function isRandomSortBy(x: unknown): x is RandomSortBy {
  return typeof x === 'string' && (RANDOM_SORT_KEYS as readonly string[]).includes(x);
}

export function mergeRandomAiCutoffs(partial?: Partial<RandomAiCutoffs> | null): RandomAiCutoffs {
  return { ...DEFAULT_RANDOM_AI_CUTOFFS, ...(partial ?? {}) };
}

export async function getRandomPickerState(): Promise<RandomPickerPersisted | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RandomPickerPersisted;
    if (parsed?.v !== 1 || !Array.isArray(parsed.selectedIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRandomPickerState(state: RandomPickerPersisted): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export async function clearRandomPickerState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type ResetListener = () => void;
const resetListeners = new Set<ResetListener>();

export function onRandomPickerReset(listener: ResetListener): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

export function requestRandomPickerReset(): void {
  resetListeners.forEach((fn) => fn());
}
