import { supabase } from './supabaseClient';

export async function fetchAiMenu(placeId: string, websiteUri?: string, placeName?: string, cuisine?: string): Promise<string[]> {
  if (!websiteUri || !placeId) return [];
  try {
    const { data, error } = await supabase.functions.invoke('generate-ai-menus', {
      body: { placeId, websiteUri, placeName, cuisine },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });

    if (error) {
      console.warn('[fetchAiMenu] Edge function error:', error);
      return [];
    }

    if (data && Array.isArray(data.items)) {
      return data.items;
    }
  } catch (error) {
    console.warn('[fetchAiMenu] network or parsing error:', error);
  }

  return [];
}

