import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IonName = ComponentProps<typeof Ionicons>['name'];

const PRIMARY_TYPE_ICONS: Record<string, IonName> = {
  // Seafood / Japanese
  japanese_restaurant: 'fish',
  sushi_restaurant: 'fish',
  seafood_restaurant: 'fish',
  poke_restaurant: 'fish',
  // Pizza / Italian
  pizza_restaurant: 'pizza',
  italian_restaurant: 'pizza',
  // Fast food / Burgers / Sandwiches
  fast_food_restaurant: 'fast-food',
  hamburger_restaurant: 'fast-food',
  american_restaurant: 'fast-food',
  sandwich_shop: 'fast-food',
  hot_dog_restaurant: 'fast-food',
  food_court: 'fast-food',
  // Coffee / Tea
  cafe: 'cafe',
  coffee_shop: 'cafe',
  tea_house: 'cafe',
  // Cocktail bars / Nightlife — wine glass is the closest cocktail icon
  bar: 'wine',
  cocktail_bar: 'wine',
  lounge: 'wine',
  night_club: 'wine',
  // Wine
  wine_bar: 'wine',
  // Beer — pubs, beer gardens, breweries
  pub: 'beer',
  beer_garden: 'beer',
  sports_bar: 'beer',
  brewery: 'beer',
  // Ice cream / Desserts / Sweets
  ice_cream_shop: 'ice-cream',
  dessert_restaurant: 'ice-cream',
  donut_shop: 'ice-cream',
  candy_store: 'ice-cream',
  // Bakery
  bakery: 'nutrition',
  // Breakfast / Brunch
  breakfast_restaurant: 'sunny',
  brunch_restaurant: 'sunny',
  diner: 'sunny',
  // BBQ / Spicy / Grilled
  barbecue_restaurant: 'flame',
  mexican_restaurant: 'flame',
  indian_restaurant: 'flame',
  korean_restaurant: 'flame',
  turkish_restaurant: 'flame',
  chicken_restaurant: 'flame',
  // Vegan / Vegetarian / Health
  vegan_restaurant: 'leaf',
  vegetarian_restaurant: 'leaf',
  health_food_restaurant: 'leaf',
  salad_shop: 'leaf',
  thai_restaurant: 'leaf',
  // Juices / Smoothies / Acai
  juice_shop: 'water',
  acai_shop: 'water',
  smoothie_bar: 'water',
  // Fine dining / Steakhouse
  steak_house: 'restaurant',
  fine_dining_restaurant: 'restaurant',
  restaurant: 'restaurant',
  buffet_restaurant: 'restaurant',
  // Asian
  chinese_restaurant: 'restaurant',
  vietnamese_restaurant: 'restaurant',
  ramen_restaurant: 'restaurant',
  // Mediterranean / European
  mediterranean_restaurant: 'restaurant',
  greek_restaurant: 'restaurant',
  middle_eastern_restaurant: 'restaurant',
  lebanese_restaurant: 'restaurant',
  french_restaurant: 'wine',
  // Tapas / Spanish
  spanish_restaurant: 'wine',
  tapas_restaurant: 'wine',
};

const FALLBACK_ICONS: IonName[] = [
  'restaurant',
  'fast-food',
  'wine',
  'beer',
  'cafe',
  'pizza',
  'ice-cream',
  'nutrition',
  'fish',
  'flame',
  'leaf',
];

export function markerIconForPlace(place: any): IonName {
  const pt = String(place?.primaryType || '').toLowerCase();
  if (pt && PRIMARY_TYPE_ICONS[pt]) return PRIMARY_TYPE_ICONS[pt]!;
  const id = String(place?.id || pt || '');
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return FALLBACK_ICONS[Math.abs(h) % FALLBACK_ICONS.length] ?? 'restaurant';
}
