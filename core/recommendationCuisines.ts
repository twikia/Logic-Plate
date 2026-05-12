export type CuisineTile = { id: string; label: string; emoji: string; match: (place: any) => boolean };

const PT_MATCHERS: Record<string, string[]> = {
  italian: ['italian_restaurant'],
  japanese: ['japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant'],
  mexican: ['mexican_restaurant', 'tex_mex_restaurant'],
  american: ['american_restaurant', 'hamburger_restaurant', 'steak_house'],
  chinese: ['chinese_restaurant'],
  thai: ['thai_restaurant'],
  indian: ['indian_restaurant'],
  korean: ['korean_restaurant'],
  vietnamese: ['vietnamese_restaurant'],
  mediterranean: ['mediterranean_restaurant', 'greek_restaurant', 'middle_eastern_restaurant'],
  french: ['french_restaurant'],
  seafood: ['seafood_restaurant', 'fish_and_chips_restaurant'],
  pizza: ['pizza_restaurant'],
  bbq: ['barbecue_restaurant'],
  breakfast: ['breakfast_restaurant', 'brunch_restaurant'],
  cafe: ['cafe', 'coffee_shop', 'tea_house'],
  healthy: [
    'health_food_restaurant',
    'vegetarian_restaurant',
    'vegan_restaurant',
    'salad_shop',
    'juice_shop',
    'acai_shop',
  ],
  fast_casual: ['fast_food_restaurant', 'sandwich_shop', 'meal_takeaway'],
  spanish: ['spanish_restaurant', 'tapas_restaurant'],
  middle_eastern: ['lebanese_restaurant', 'turkish_restaurant', 'middle_eastern_restaurant'],
};

function matcherFor(typesList: string[]): (place: any) => boolean {
  return (place: any) => {
    const pt = (place?.primaryType || '').toLowerCase();
    const types: string[] = (place?.types || []).map((t: string) => String(t).toLowerCase());
    return typesList.some(x => pt === x || types.includes(x));
  };
}

export const TOP_CUISINE_TILES: CuisineTile[] = [
  { id: 'italian', label: 'Italian', emoji: '🍝', match: matcherFor(PT_MATCHERS.italian!) },
  { id: 'japanese', label: 'Japanese', emoji: '🍣', match: matcherFor(PT_MATCHERS.japanese!) },
  { id: 'mexican', label: 'Mexican', emoji: '🌮', match: matcherFor(PT_MATCHERS.mexican!) },
  { id: 'american', label: 'American', emoji: '🍔', match: matcherFor(PT_MATCHERS.american!) },
  { id: 'chinese', label: 'Chinese', emoji: '🥟', match: matcherFor(PT_MATCHERS.chinese!) },
  { id: 'thai', label: 'Thai', emoji: '🍜', match: matcherFor(PT_MATCHERS.thai!) },
  { id: 'indian', label: 'Indian', emoji: '🍛', match: matcherFor(PT_MATCHERS.indian!) },
  { id: 'korean', label: 'Korean', emoji: '🥘', match: matcherFor(PT_MATCHERS.korean!) },
  { id: 'vietnamese', label: 'Vietnamese', emoji: '🍲', match: matcherFor(PT_MATCHERS.vietnamese!) },
  { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒', match: matcherFor(PT_MATCHERS.mediterranean!) },
  { id: 'french', label: 'French', emoji: '🥖', match: matcherFor(PT_MATCHERS.french!) },
  { id: 'seafood', label: 'Seafood', emoji: '🦞', match: matcherFor(PT_MATCHERS.seafood!) },
  { id: 'pizza', label: 'Pizza', emoji: '🍕', match: matcherFor(PT_MATCHERS.pizza!) },
  { id: 'bbq', label: 'BBQ', emoji: '🍖', match: matcherFor(PT_MATCHERS.bbq!) },
  { id: 'breakfast', label: 'Breakfast', emoji: '🥞', match: matcherFor(PT_MATCHERS.breakfast!) },
  { id: 'cafe', label: 'Café', emoji: '☕', match: matcherFor(PT_MATCHERS.cafe!) },
  { id: 'healthy', label: 'Healthy', emoji: '🥗', match: matcherFor(PT_MATCHERS.healthy!) },
  { id: 'fast_casual', label: 'Fast casual', emoji: '🥙', match: matcherFor(PT_MATCHERS.fast_casual!) },
  { id: 'spanish', label: 'Spanish / tapas', emoji: '🫑', match: matcherFor(PT_MATCHERS.spanish!) },
  { id: 'middle_eastern', label: 'Middle Eastern', emoji: '🧆', match: matcherFor(PT_MATCHERS.middle_eastern!) },
];

export function placeMatchesFavoriteCuisine(place: any, favoriteIds: string[]): boolean {
  if (!favoriteIds.length) return false;
  for (const id of favoriteIds) {
    const tile = TOP_CUISINE_TILES.find(t => t.id === id);
    if (tile?.match(place)) return true;
  }
  return false;
}
