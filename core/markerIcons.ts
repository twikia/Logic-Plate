import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IonName = ComponentProps<typeof Ionicons>['name'];

const PRIMARY_TYPE_ICONS: Record<string, IonName> = {
  japanese_restaurant: 'fish-outline',
  sushi_restaurant: 'fish-outline',
  seafood_restaurant: 'fish-outline',
  pizza_restaurant: 'pizza-outline',
  italian_restaurant: 'pizza-outline',
  fast_food_restaurant: 'fast-food-outline',
  hamburger_restaurant: 'fast-food-outline',
  cafe: 'cafe-outline',
  coffee_shop: 'cafe-outline',
  bar: 'wine-outline',
  wine_bar: 'wine-outline',
  ice_cream_shop: 'ice-cream-outline',
  bakery: 'nutrition-outline',
  breakfast_restaurant: 'sunny-outline',
  brunch_restaurant: 'sunny-outline',
  steak_house: 'restaurant-outline',
  vegan_restaurant: 'leaf-outline',
  vegetarian_restaurant: 'leaf-outline',
  salad_shop: 'leaf-outline',
  juice_shop: 'water-outline',
  acai_shop: 'water-outline',
};

const FALLBACK_ICONS: IonName[] = [
  'restaurant-outline',
  'fast-food-outline',
  'wine-outline',
  'cafe-outline',
  'pizza-outline',
  'ice-cream-outline',
  'nutrition-outline',
  'fish-outline',
];

export function markerIconForPlace(place: any): IonName {
  const pt = String(place?.primaryType || '').toLowerCase();
  if (pt && PRIMARY_TYPE_ICONS[pt]) return PRIMARY_TYPE_ICONS[pt]!;
  const id = String(place?.id || pt || '');
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return FALLBACK_ICONS[Math.abs(h) % FALLBACK_ICONS.length] ?? 'restaurant-outline';
}
