export type ScenarioKey =
  | 'healthiest'
  | 'workplace'
  | 'quick_bites'
  | 'date_night'
  | 'vegetarian_forward'
  | 'comfort_classics';

export const SCENARIO_ORDER: ScenarioKey[] = [
  'healthiest',
  'workplace',
  'quick_bites',
  'date_night',
  'vegetarian_forward',
  'comfort_classics',
];

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  healthiest: 'Healthiest',
  workplace: 'Workplace',
  quick_bites: 'Quick bites',
  date_night: 'Date night',
  vegetarian_forward: 'Plant-forward',
  comfort_classics: 'Comfort classics',
};

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
    default:
      return true;
  }
}

export function isScenarioKey(value: string | null | undefined): value is ScenarioKey {
  return !!value && (SCENARIO_ORDER as string[]).includes(value);
}
