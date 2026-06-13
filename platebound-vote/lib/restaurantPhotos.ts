import type { SupabaseClient } from '@supabase/supabase-js';

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (typeof url === 'string' && url.startsWith('http') && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

export async function fetchPhotoUrlForPlace(
  supabase: SupabaseClient,
  placeId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('restaurant_photo_cache')
    .select('photo_urls, og_urls, wikimedia_urls, unsplash_urls')
    .eq('google_place_id', placeId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    photo_urls?: string[] | null;
    og_urls?: string[] | null;
    wikimedia_urls?: string[] | null;
    unsplash_urls?: string[] | null;
  };

  const urls = dedupeUrls([
    ...(Array.isArray(row.photo_urls) ? row.photo_urls : []),
    ...(Array.isArray(row.og_urls) ? row.og_urls : []),
    ...(Array.isArray(row.wikimedia_urls) ? row.wikimedia_urls : []),
    ...(Array.isArray(row.unsplash_urls) ? row.unsplash_urls : []),
  ]);

  return urls[0] ?? null;
}

export async function fetchPhotoUrlsForPlaces(
  supabase: SupabaseClient,
  placeIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(placeIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase
    .from('restaurant_photo_cache')
    .select('google_place_id, photo_urls, og_urls, wikimedia_urls, unsplash_urls')
    .in('google_place_id', unique);

  if (error || !data) return {};

  const out: Record<string, string> = {};
  for (const row of data as Array<{
    google_place_id: string;
    photo_urls?: string[] | null;
    og_urls?: string[] | null;
    wikimedia_urls?: string[] | null;
    unsplash_urls?: string[] | null;
  }>) {
    const urls = dedupeUrls([
      ...(Array.isArray(row.photo_urls) ? row.photo_urls : []),
      ...(Array.isArray(row.og_urls) ? row.og_urls : []),
      ...(Array.isArray(row.wikimedia_urls) ? row.wikimedia_urls : []),
      ...(Array.isArray(row.unsplash_urls) ? row.unsplash_urls : []),
    ]);
    if (urls[0]) out[row.google_place_id] = urls[0];
  }
  return out;
}
