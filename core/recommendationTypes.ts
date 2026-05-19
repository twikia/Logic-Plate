export type DefaultGroupSize = 'solo' | 'partner' | 'small_group' | 'big_group' | 'varies';

export type ImportanceLevel = 1 | 2 | 3 | 4 | 5;

export type RecommendationWeights = {
  speed: ImportanceLevel;
  cost: ImportanceLevel;
  distance: ImportanceLevel;
  health: ImportanceLevel;
  workoutRecovery: ImportanceLevel;
  protein: ImportanceLevel;
  calories: ImportanceLevel;
  cuisine: ImportanceLevel;
  cuisineVariety: ImportanceLevel;
  cuisineAdherence: ImportanceLevel;
  taste: ImportanceLevel;
};

export type DietaryFilterId =
  | 'vegetarian'
  | 'vegan'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_allergy';

export type DefaultRadiusId = 'walking' | 'short_drive' | 'worth_trip';

export type SessionGroupChip = 'solo' | 'partner' | 'small_group' | 'big_group';

export type MealTypeContext = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late_night';

export type SessionMood = 'comfort' | 'light' | 'adventurous' | 'quick' | 'special';

export type RecommendationPrefsV1 = {
  v: 1;
  onboardingComplete: boolean;
  defaultGroupSize: DefaultGroupSize;
  weights: RecommendationWeights;
  dietaryFilters: DietaryFilterId[];
  budgetCeiling: number;
  favoriteCuisines: string[];
  defaultRadius: DefaultRadiusId;
  openNowOnly: boolean;
  minimumRatingThreshold: number;
  noveltyPressure: number;
  penalizeRepeats: boolean;
  cuisineRepeatWindowDays: number;
};

export type SessionOverrides = {
  mealType: MealTypeContext;
  groupSize: SessionGroupChip;
  budgetCeiling: number;
  radiusMeters: number;
  sessionMood: SessionMood | null;
};

export type MatchPillKind =
  | 'distance'
  | 'health'
  | 'value'
  | 'rating'
  | 'novelty'
  | 'groups'
  | 'tonight'
  | 'vibe';

export type ScoredRestaurant = {
  place: any;
  plateboundScore: number;
  raw: {
    distance: number;
    health: number;
    price: number;
    rating: number;
    novelty: number;
  };
  weightedParts: {
    distance: number;
    health: number;
    price: number;
    rating: number;
    novelty: number;
  };
  modifiers: {
    meal: number;
    group: number;
    mood: number;
    time: number;
  };
  matchPills: { kind: MatchPillKind; emoji: string; label: string }[];
};

export const DEFAULT_WEIGHTS: RecommendationWeights = {
  speed: 3,
  cost: 3,
  distance: 3,
  health: 3,
  workoutRecovery: 3,
  protein: 3,
  calories: 3,
  cuisine: 3,
  cuisineVariety: 3,
  cuisineAdherence: 3,
  taste: 3,
};

export const DEFAULT_PREFS_V1: RecommendationPrefsV1 = {
  v: 1,
  onboardingComplete: false,
  defaultGroupSize: 'solo',
  weights: { ...DEFAULT_WEIGHTS },
  dietaryFilters: [],
  budgetCeiling: 20,
  favoriteCuisines: ['italian'],
  defaultRadius: 'short_drive',
  openNowOnly: false,
  minimumRatingThreshold: 3.5,
  noveltyPressure: 50,
  penalizeRepeats: true,
  cuisineRepeatWindowDays: 7,
};

export function radiusIdToMeters(id: DefaultRadiusId): number {
  switch (id) {
    case 'walking':
      return 800;
    case 'short_drive':
      return 3000;
    case 'worth_trip':
      return 8000;
    default:
      return 3000;
  }
}

export function defaultGroupToSessionChip(size: DefaultGroupSize): SessionGroupChip {
  switch (size) {
    case 'partner':
      return 'partner';
    case 'small_group':
      return 'small_group';
    case 'big_group':
      return 'big_group';
    case 'varies':
      return 'small_group';
    default:
      return 'solo';
  }
}

export function inferMealTypeFromClock(d: Date = new Date()): MealTypeContext {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 22) return 'dinner';
  return 'late_night';
}

export function budgetToPriceLevelsAtOrBelow(budget: number): string[] {
  const all = [
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE',
  ];
  if (budget < 15) return ['PRICE_LEVEL_INEXPENSIVE'];
  if (budget < 30) return ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'];
  if (budget < 60) return ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE'];
  return all;
}
