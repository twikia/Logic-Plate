/**
 * Phase 4: Google Places API Fetcher
 */
export const fetchRestaurantsFromGoogle = async (lat: number, lng: number) => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) throw new Error('Missing Google Maps API Key');

  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const requestBody = {
    includedTypes: [
      'restaurant', 'cafe', 'bar', 'coffee_shop', 'fast_food_restaurant', 
      'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'ice_cream_shop',
      'steak_house', 'seafood_restaurant', 'american_restaurant', 'breakfast_restaurant',
      'brunch_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant',
      'mexican_restaurant', 'thai_restaurant', 'vegetarian_restaurant', 'vegan_restaurant',
      'meal_takeaway', 'meal_delivery'
    ],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: 1200.0,
      },
    },
  };

  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.priceLevel,places.rating,places.userRatingCount,places.currentOpeningHours,places.regularOpeningHours,places.businessStatus,places.photos,places.websiteUri,places.nationalPhoneNumber';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google Places API Error:', errorText);
    throw new Error(`Google Places API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.places || [];
};
