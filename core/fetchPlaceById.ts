import {
  getCachedAiOverviewsForPlaces,
  mergeAiOverviewsOntoPlaces,
  type PlaceSeed,
} from './aiOverviewCache';
import { readCacheBulk, type CachedPlace } from './cacheManager';
import { getRes7CellId } from './h3Utils';
import { supabase } from './supabaseClient';

function toPlaceSeed(place: CachedPlace): PlaceSeed {
  return {
    id: place.id,
    name: place.name,
    website_url: place.website_url,
    address: place.address,
    city: place.city,
    region: place.region,
    postcode: place.postcode,
    country: place.country,
    category: place.category,
    location: place.location,
    phone: place.phone,
    price_tier: place.priceTier ?? null,
    operating_status: place.operating_status ?? null,
    regular_opening_hours: place.regularOpeningHours ?? null,
    attributes: place.attributes ?? null,
  };
}

function normalizePlace(raw: unknown): CachedPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const place = raw as CachedPlace;
  if (
    typeof place.id !== 'string' ||
    typeof place.name !== 'string' ||
    place.location?.latitude == null ||
    place.location?.longitude == null
  ) {
    return null;
  }
  return place;
}

async function findPlaceInCellCache(placeId: string, lat: number, lng: number): Promise<CachedPlace | null> {
  const cellId = getRes7CellId(lat, lng);
  const { hits } = await readCacheBulk([cellId]);
  const fromLocal = hits.get(cellId)?.find((p) => p.id === placeId);
  if (fromLocal) return fromLocal;

  try {
    const { data, error } = await supabase
      .from('v2_restaurant_cell_cache')
      .select('restaurants')
      .eq('id', cellId)
      .maybeSingle();
    if (error || !data?.restaurants) return null;
    const places = Array.isArray(data.restaurants) ? data.restaurants : [];
    for (const raw of places) {
      const place = normalizePlace(raw);
      if (place?.id === placeId) return place;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Hydrate a saved place for the details screen: prefer DB/cell-cache by GERS id
 * (via the place's H3 cell), then merge AI overview from v2_ai_overview_cache.
 * Falls back to the local favorites snapshot when the cell is no longer nearby/cached.
 */
export async function hydrateFavoritePlace(snapshot: CachedPlace): Promise<any> {
  const lat = snapshot.location?.latitude;
  const lng = snapshot.location?.longitude;
  let place: CachedPlace = snapshot;

  if (typeof lat === 'number' && typeof lng === 'number') {
    const fromDb = await findPlaceInCellCache(snapshot.id, lat, lng);
    if (fromDb) place = fromDb;
  }

  const aiById = await getCachedAiOverviewsForPlaces([toPlaceSeed(place)]);
  return mergeAiOverviewsOntoPlaces([place], aiById)[0] ?? place;
}
