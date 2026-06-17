import { Alert } from 'react-native';
import { supabase } from '@/core/supabaseClient';

export const runAiEdgeTest = async () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const testPlaces = [
    {
      id: `test_place_${nonce}_a`,
      name: 'Fuel Kitchen Test',
      formattedAddress: '123 Demo Ave, Austin, TX',
      primaryType: 'health_food_restaurant',
      primaryTypeDisplayName: 'Health Food Restaurant',
      types: ['restaurant', 'health_food_restaurant', 'meal_takeaway'],
      priceLevel: 'PRICE_LEVEL_MODERATE',
      rating: 4.5,
      userRatingCount: 182,
      location: { latitude: 30.2672, longitude: -97.7431 },
      googleMapsUri: 'https://maps.google.com/?q=30.2672,-97.7431',
      websiteUri: 'https://example.com/fuel-kitchen',
      nationalPhoneNumber: '+1 512-555-0111',
      businessStatus: 'OPERATIONAL',
      currentOpeningHours: { openNow: true, weekdayDescriptions: ['Mon-Fri: 7:00 AM-9:00 PM'] },
      servesBreakfast: true,
      servesLunch: true,
      servesDinner: true,
      servesVegetarianFood: true,
      servesWine: false,
      servesBeer: false,
      servesCocktails: false,
      servesDessert: true,
      servesCoffee: true,
      goodForChildren: true,
      takeout: true,
      delivery: true,
      dineIn: true,
      curbsidePickup: true,
      paymentOptions: { acceptsCreditCards: true, acceptsDebitCards: true, acceptsNfc: true },
      parkingOptions: { freeParkingLot: true, freeStreetParking: true },
      editorialSummary: 'Fast-casual bowls and protein-forward menu.',
      allowsDogs: true,
    },
    {
      id: `test_place_${nonce}_b`,
      name: 'Late Night Grill Test',
      formattedAddress: '456 Sample St, Austin, TX',
      primaryType: 'hamburger_restaurant',
      primaryTypeDisplayName: 'Hamburger Restaurant',
      types: ['restaurant', 'hamburger_restaurant', 'fast_food_restaurant'],
      priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
      rating: 4.1,
      userRatingCount: 640,
      location: { latitude: 30.272, longitude: -97.735 },
      googleMapsUri: 'https://maps.google.com/?q=30.272,-97.735',
      businessStatus: 'OPERATIONAL',
      currentOpeningHours: { openNow: true, weekdayDescriptions: ['Daily: 10:00 AM-1:00 AM'] },
      servesLunch: true,
      servesDinner: true,
      servesBeer: true,
      servesCoffee: false,
      goodForChildren: false,
      takeout: true,
      delivery: true,
      dineIn: true,
      paymentOptions: { acceptsCreditCards: true, acceptsDebitCards: true },
      parkingOptions: { paidStreetParking: true },
      editorialSummary: 'Popular for quick burgers and shakes.',
      allowsDogs: false,
    },
  ];

  try {
    const { data, error } = await supabase.functions.invoke('generate-ai-overviews', {
      body: { places: testPlaces },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });
    if (error) throw error;
    const count = Array.isArray(data?.generatedOverviews) ? data.generatedOverviews.length : 0;
    Alert.alert('AI Edge Test Complete', `Function returned ${count} generated overview(s).`);
  } catch (e: any) {
    Alert.alert('AI Edge Test Failed', e?.message || 'Unknown error');
  }
};
