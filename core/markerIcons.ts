import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IonName = ComponentProps<typeof Ionicons>['name'];

const PRIMARY_TYPE_ICONS: Record<string, IonName> = {
  japanese_restaurant: 'fish',
  sushi_restaurant: 'fish',
  seafood_restaurant: 'fish',
  poke_restaurant: 'fish',
  pizza_restaurant: 'pizza',
  italian_restaurant: 'pizza',
  fast_food_restaurant: 'fast-food',
  hamburger_restaurant: 'fast-food',
  american_restaurant: 'fast-food',
  sandwich_shop: 'fast-food',
  cafe: 'cafe',
  coffee_shop: 'cafe',
  tea_house: 'cafe',
  bar: 'wine',
  wine_bar: 'wine',
  pub: 'beer',
  ice_cream_shop: 'ice-cream',
  dessert_restaurant: 'ice-cream',
  donut_shop: 'ice-cream',
  bakery: 'nutrition',
  breakfast_restaurant: 'sunny',
  brunch_restaurant: 'sunny',
  steak_house: 'restaurant',
  fine_dining_restaurant: 'restaurant',
  restaurant: 'restaurant',
  barbecue_restaurant: 'flame',
  mexican_restaurant: 'flame',
  vegan_restaurant: 'leaf',
  vegetarian_restaurant: 'leaf',
  health_food_restaurant: 'leaf',
  salad_shop: 'leaf',
  juice_shop: 'water',
  acai_shop: 'water',
  chinese_restaurant: 'restaurant',
  thai_restaurant: 'leaf',
  indian_restaurant: 'restaurant',
  korean_restaurant: 'restaurant',
  mediterranean_restaurant: 'restaurant',
  greek_restaurant: 'restaurant',
  vietnamese_restaurant: 'restaurant',
  spanish_restaurant: 'wine',
  tapas_restaurant: 'wine',
  ramen_restaurant: 'restaurant',
};

const FALLBACK_ICONS: IonName[] = [
  'restaurant',
  'fast-food',
  'wine',
  'cafe',
  'pizza',
  'ice-cream',
  'nutrition',
  'fish',
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
