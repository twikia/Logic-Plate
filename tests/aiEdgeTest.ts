import { Alert } from 'react-native';
import { supabase } from '@/core/supabaseClient';

export const runAiEdgeTest = async () => {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const testPlaces = [
    {
      gers_id: `test_place_${nonce}_a`,
      name: 'Fuel Kitchen Test',
      website_url: 'https://example.com/fuel-kitchen',
      address: '123 Demo Ave',
      city: 'Austin',
      category: 'health_food_restaurant',
      location: { latitude: 30.2672, longitude: -97.7431 },
      phone: '+1 512-555-0111',
    },
    {
      gers_id: `test_place_${nonce}_b`,
      name: 'Late Night Grill Test',
      address: '456 Sample St',
      city: 'Austin',
      category: 'hamburger_restaurant',
      location: { latitude: 30.272, longitude: -97.735 },
    },
  ];

  try {
    const { data, error } = await supabase.functions.invoke('v2-generate-ai-overview', {
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
