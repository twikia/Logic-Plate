import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const APP_SECRET = Constants.expoConfig?.extra?.appSecret || process.env.EXPO_PUBLIC_APP_SECRET || '';

export async function fetchAiMenu(placeId: string, websiteUri?: string): Promise<string[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai-menus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': APP_SECRET,
      },
      body: JSON.stringify({ placeId, websiteUri }),
    });

    if (!res.ok) {
      console.warn('[fetchAiMenu] Edge function error:', res.status);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('[fetchAiMenu] network or parsing error:', error);
    return [];
  }
}
