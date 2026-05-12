import { supabase } from './supabaseClient';

export async function requestGeminiRerollPick(userText: string, places: any[]): Promise<string | null> {
  if (!userText.trim() || places.length === 0) return null;
  try {
    const { data, error } = await supabase.functions.invoke('recommendation-feedback', {
      body: { userText: userText.trim(), places },
      headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
    });
    if (error) return null;
    const id = typeof data?.placeId === 'string' ? data.placeId : null;
    return id && places.some(p => p?.id === id) ? id : null;
  } catch {
    return null;
  }
}
