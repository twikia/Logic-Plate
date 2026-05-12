import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'random_picker_state_v1';

export type RandomPickerPersisted = {
  v: 1;
  filter: string;
  openOnly: boolean;
  selectedPrices: string[];
  minRating: number;
  selectedCuisines: string[];
  sortBy: 'distance' | 'price' | 'health' | 'rating';
  selectedIds: string[];
  scenarioKey?: string | null;
  scenarioFilterEnabled?: boolean;
};

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
