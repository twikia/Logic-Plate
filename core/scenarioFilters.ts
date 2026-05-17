import type { RandomSortBy } from './randomPickerState';

export type ScenarioKey =
  | 'healthiest'
  | 'workplace'
  | 'quick_bites'
  | 'date_night'
  | 'vegetarian_forward'
  | 'comfort_classics'
  | 'budget_friendly'
  | 'seafood_focus'
  | 'sweet_treat'
  | 'pub_night';

export const SCENARIO_ORDER: ScenarioKey[] = [
  'healthiest',
  'workplace',
  'quick_bites',
  'date_night',
  'vegetarian_forward',
  'comfort_classics',
  'budget_friendly',
  'seafood_focus',
  'sweet_treat',
  'pub_night',
];

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  healthiest: 'Healthiest',
  workplace: 'Workplace',
  quick_bites: 'Quick bites',
  date_night: 'Date night',
  vegetarian_forward: 'Plant-forward',
  comfort_classics: 'Comfort classics',
  budget_friendly: 'Budget eats',
  seafood_focus: 'Seafood',
  sweet_treat: 'Sweet treat',
  pub_night: 'Pub & drinks',
};

export const SCENARIO_EMOJIS: Record<ScenarioKey, string> = {
  healthiest: '🥗',
  workplace: '☕',
  quick_bites: '🍔',
  date_night: '🍷',
  vegetarian_forward: '🌿',
  comfort_classics: '🍕',
  budget_friendly: '💵',
  seafood_focus: '🦐',
  sweet_treat: '🍰',
  pub_night: '🍺',
};

export const SCENARIO_PREFERRED_SORT: Record<ScenarioKey, RandomSortBy> = {
  healthiest: 'health',
  workplace: 'soloDiner',
  quick_bites: 'speed',
  date_night: 'dateWorthiness',
  vegetarian_forward: 'health',
  comfort_classics: 'taste',
  budget_friendly: 'valueForMoney',
  seafood_focus: 'taste',
  sweet_treat: 'munchy',
  pub_night: 'rating',
};

export function getScenarioPreferredSort(key: ScenarioKey): RandomSortBy {
  return SCENARIO_PREFERRED_SORT[key];
}

function hasType(place: any, type: string) {
  const p = place?.primaryType;
  const t: string[] = place?.types || [];
  return p === type || t.includes(type);
}

export function restaurantMatchesScenario(place: any, key: ScenarioKey): boolean {
  const ai = place?.aiOverview;
  switch (key) {
    case 'healthiest': {
      const h = ai?.healthScore;
      if (typeof h === 'number' && Number.isFinite(h)) return h >= 5.5;
      return (
        hasType(place, 'vegan_restaurant') ||
        hasType(place, 'vegetarian_restaurant') ||
        hasType(place, 'salad_shop') ||
        hasType(place, 'juice_shop')
      );
    }
    case 'workplace': {
      const ok =
        hasType(place, 'cafe') ||
        hasType(place, 'coffee_shop') ||
        hasType(place, 'mediterranean_restaurant') ||
        hasType(place, 'american_restaurant') ||
        hasType(place, 'italian_restaurant') ||
        hasType(place, 'japanese_restaurant') ||
        hasType(place, 'salad_shop');
      const bad = hasType(place, 'bar') || hasType(place, 'night_club') || hasType(place, 'liquor_store');
      return ok && !bad;
    }
    case 'quick_bites': {
      return (
        hasType(place, 'fast_food_restaurant') ||
        hasType(place, 'meal_takeaway') ||
        hasType(place, 'hamburger_restaurant') ||
        hasType(place, 'sandwich_shop') ||
        hasType(place, 'pizza_restaurant') ||
        hasType(place, 'meal_delivery')
      );
    }
    case 'date_night': {
      return (
        hasType(place, 'italian_restaurant') ||
        hasType(place, 'steak_house') ||
        hasType(place, 'french_restaurant') ||
        hasType(place, 'fine_dining_restaurant') ||
        hasType(place, 'spanish_restaurant') ||
        hasType(place, 'japanese_restaurant') ||
        hasType(place, 'sushi_restaurant')
      );
    }
    case 'vegetarian_forward': {
      return (
        hasType(place, 'vegan_restaurant') ||
        hasType(place, 'vegetarian_restaurant') ||
        hasType(place, 'indian_restaurant') ||
        hasType(place, 'mediterranean_restaurant') ||
        hasType(place, 'salad_shop') ||
        hasType(place, 'thai_restaurant')
      );
    }
    case 'comfort_classics': {
      return (
        hasType(place, 'american_restaurant') ||
        hasType(place, 'mexican_restaurant') ||
        hasType(place, 'pizza_restaurant') ||
        hasType(place, 'hamburger_restaurant') ||
        hasType(place, 'barbecue_restaurant')
      );
    }
    case 'budget_friendly': {
      return (
        hasType(place, 'fast_food_restaurant') ||
        hasType(place, 'meal_takeaway') ||
        hasType(place, 'food_court') ||
        hasType(place, 'meal_delivery') ||
        hasType(place, 'pizza_restaurant') ||
        hasType(place, 'sandwich_shop') ||
        hasType(place, 'ramen_restaurant') ||
        hasType(place, 'diner')
      );
    }
    case 'seafood_focus': {
      return (
        hasType(place, 'seafood_restaurant') ||
        hasType(place, 'fish_restaurant') ||
        hasType(place, 'sushi_restaurant')
      );
    }
    case 'sweet_treat': {
      return (
        hasType(place, 'ice_cream_shop') ||
        hasType(place, 'bakery') ||
        hasType(place, 'dessert_shop') ||
        hasType(place, 'candy_store') ||
        hasType(place, 'donut_shop') ||
        hasType(place, 'chocolate_shop') ||
        hasType(place, 'confectionery') ||
        hasType(place, 'pastry_shop') ||
        hasType(place, 'acai_shop')
      );
    }
    case 'pub_night': {
      return (
        hasType(place, 'bar') ||
        hasType(place, 'pub') ||
        hasType(place, 'wine_bar') ||
        hasType(place, 'sports_bar') ||
        hasType(place, 'brewery') ||
        hasType(place, 'bar_and_grill')
      );
    }
    default:
      return true;
  }
}

export function isScenarioKey(value: string | null | undefined): value is ScenarioKey {
  return !!value && (SCENARIO_ORDER as string[]).includes(value);
}
