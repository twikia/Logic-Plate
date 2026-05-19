import type { RandomSortBy } from './randomPickerState';

export type ScenarioKey =
  | 'close_fast'
  | 'wallet_friendly'
  | 'health'
  | 'light_coffee'
  | 'work'
  | 'date'
  | 'group_close'
  | 'munchies'
  | 'recovery_protein';

/** Most-used scenarios first (home quick-bar scroll order). */
export const SCENARIO_ORDER: ScenarioKey[] = [
  'close_fast',
  'wallet_friendly',
  'health',
  'light_coffee',
  'work',
  'date',
  'group_close',
  'munchies',
  'recovery_protein',
];

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  close_fast: 'Quick & Close',
  wallet_friendly: 'Wallet Wins',
  health: 'Eat Clean',
  light_coffee: 'Light & Coffee',
  work: 'Work Mode',
  date: 'Date Night',
  group_close: 'Squad Nearby',
  munchies: 'Munchie Mode',
  recovery_protein: 'Recover & Fuel',
};

export const SCENARIO_EMOJIS: Record<ScenarioKey, string> = {
  close_fast: '⚡',
  wallet_friendly: '💰',
  health: '🥗',
  light_coffee: '☕',
  work: '💻',
  date: '🍷',
  group_close: '👥',
  munchies: '🌙',
  recovery_protein: '💪',
};

export const SCENARIO_PREFERRED_SORT: Record<ScenarioKey, RandomSortBy> = {
  close_fast: 'speed',
  wallet_friendly: 'valueForMoney',
  health: 'health',
  light_coffee: 'energySustain',
  work: 'soloDiner',
  date: 'dateWorthiness',
  group_close: 'distance',
  munchies: 'munchy',
  recovery_protein: 'protein',
};

export function getScenarioPreferredSort(key: ScenarioKey): RandomSortBy {
  return SCENARIO_PREFERRED_SORT[key];
}

function hasType(place: any, type: string) {
  const p = place?.primaryType;
  const t: string[] = place?.types || [];
  return p === type || t.includes(type);
}

function hasAnyType(place: any, types: string[]) {
  return types.some(t => hasType(place, t));
}

function aiIntAtLeast(ai: any, field: string, min: number): boolean {
  const v = ai?.[field];
  return typeof v === 'number' && Number.isFinite(v) && v >= min;
}

function aiNumAtLeast(ai: any, field: string, min: number): boolean {
  const v = ai?.[field];
  return typeof v === 'number' && Number.isFinite(v) && v >= min;
}

export function restaurantMatchesScenario(place: any, key: ScenarioKey): boolean {
  const ai = place?.aiOverview;
  switch (key) {
    case 'health': {
      if (aiNumAtLeast(ai, 'healthScore', 5.5)) return true;
      return hasAnyType(place, [
        'vegan_restaurant',
        'vegetarian_restaurant',
        'salad_shop',
        'juice_shop',
        'health_food_restaurant',
      ]);
    }
    case 'close_fast': {
      if (aiIntAtLeast(ai, 'speedScore', 3.5)) return true;
      return hasAnyType(place, [
        'fast_food_restaurant',
        'meal_takeaway',
        'hamburger_restaurant',
        'sandwich_shop',
        'pizza_restaurant',
        'meal_delivery',
        'diner',
      ]);
    }
    case 'recovery_protein': {
      if (aiIntAtLeast(ai, 'proteinScore', 3.5)) return true;
      if (aiIntAtLeast(ai, 'workoutRecoveryScore', 5)) return true;
      if (aiIntAtLeast(ai, 'macroFriendlyScore', 3.5)) return true;
      return hasAnyType(place, [
        'greek_restaurant',
        'mediterranean_restaurant',
        'japanese_restaurant',
        'sushi_restaurant',
        'seafood_restaurant',
        'steak_house',
        'american_restaurant',
        'salad_shop',
      ]);
    }
    case 'munchies': {
      if (aiIntAtLeast(ai, 'munchyScore', 3.5)) return true;
      if (aiIntAtLeast(ai, 'hungoverRecoveryScore', 3.5)) return true;
      return hasAnyType(place, [
        'fast_food_restaurant',
        'hamburger_restaurant',
        'pizza_restaurant',
        'mexican_restaurant',
        'american_restaurant',
        'diner',
        'meal_takeaway',
        'bar_and_grill',
      ]);
    }
    case 'date': {
      if (aiIntAtLeast(ai, 'dateWorthiness', 3.5)) return true;
      return hasAnyType(place, [
        'italian_restaurant',
        'steak_house',
        'french_restaurant',
        'fine_dining_restaurant',
        'spanish_restaurant',
        'japanese_restaurant',
        'sushi_restaurant',
        'wine_bar',
      ]);
    }
    case 'work': {
      if (aiIntAtLeast(ai, 'workFriendlyScore', 3.5)) return true;
      if (aiIntAtLeast(ai, 'soloDinerScore', 3.5)) return true;
      const ok = hasAnyType(place, [
        'cafe',
        'coffee_shop',
        'mediterranean_restaurant',
        'american_restaurant',
        'italian_restaurant',
        'japanese_restaurant',
        'salad_shop',
        'sandwich_shop',
      ]);
      const bad =
        hasType(place, 'bar') ||
        hasType(place, 'night_club') ||
        hasType(place, 'liquor_store') ||
        hasType(place, 'sports_bar');
      return ok && !bad;
    }
    case 'light_coffee': {
      if (aiIntAtLeast(ai, 'energySustainScore', 3.5)) return true;
      if (aiIntAtLeast(ai, 'calorieScore', 3.5)) return true;
      const ok = hasAnyType(place, [
        'cafe',
        'coffee_shop',
        'bakery',
        'salad_shop',
        'juice_shop',
        'brunch_restaurant',
        'breakfast_restaurant',
        'tea_house',
      ]);
      const heavy =
        hasType(place, 'steak_house') ||
        hasType(place, 'barbecue_restaurant') ||
        hasType(place, 'buffet_restaurant');
      return ok && !heavy;
    }
    case 'wallet_friendly': {
      if (aiIntAtLeast(ai, 'valueForMoneyScore', 3.5)) return true;
      if (place?.priceLevel === 'PRICE_LEVEL_INEXPENSIVE') return true;
      return hasAnyType(place, [
        'fast_food_restaurant',
        'meal_takeaway',
        'food_court',
        'meal_delivery',
        'pizza_restaurant',
        'sandwich_shop',
        'ramen_restaurant',
        'diner',
      ]);
    }
    case 'group_close': {
      if (aiIntAtLeast(ai, 'groupSizeSweetSpot', 4)) return true;
      if (aiIntAtLeast(ai, 'varietyScore', 3.5)) return true;
      return hasAnyType(place, [
        'american_restaurant',
        'mexican_restaurant',
        'pizza_restaurant',
        'chinese_restaurant',
        'indian_restaurant',
        'thai_restaurant',
        'barbecue_restaurant',
        'bar_and_grill',
        'mediterranean_restaurant',
      ]);
    }
    default:
      return true;
  }
}

export function isScenarioKey(value: string | null | undefined): value is ScenarioKey {
  return !!value && (SCENARIO_ORDER as string[]).includes(value);
}
