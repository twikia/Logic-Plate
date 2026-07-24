import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedPlace } from './cacheManager';

const KEY = 'restaurant_favorites_v1';
const MAX = 100;

export type FavoritePlace = {
  id: string;
  savedAt: number;
  place: CachedPlace;
};

type Stored = { v: 1; items: FavoritePlace[] };

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeFavorites(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function toSnapshot(place: any): CachedPlace | null {
  const id = typeof place?.id === 'string' ? place.id : '';
  const name = typeof place?.name === 'string' ? place.name : '';
  const lat = place?.location?.latitude;
  const lng = place?.location?.longitude;
  if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    id,
    name,
    category: typeof place.category === 'string' ? place.category : 'restaurant',
    website_url: place.website_url ?? place.websiteUri ?? null,
    phone: place.phone ?? null,
    address: place.address ?? null,
    city: place.city ?? null,
    region: place.region ?? null,
    postcode: place.postcode ?? null,
    country: place.country ?? null,
    operating_status: place.operating_status ?? null,
    businessStatus: place.businessStatus ?? null,
    priceTier: place.priceTier ?? null,
    regularOpeningHours: place.regularOpeningHours ?? null,
    brand: place.brand ?? null,
    wikidata: place.wikidata ?? null,
    sources: place.sources ?? null,
    attributes: place.attributes ?? null,
    confidence: typeof place.confidence === 'number' ? place.confidence : undefined,
    location: { latitude: lat, longitude: lng },
  };
}

async function loadRaw(): Promise<FavoritePlace[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(
      (item) => item && typeof item.id === 'string' && item.place?.location?.latitude != null
    );
  } catch {
    return [];
  }
}

async function saveRaw(items: FavoritePlace[]): Promise<void> {
  const trimmed = items.slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, items: trimmed } satisfies Stored));
  notify();
}

export async function loadFavorites(): Promise<FavoritePlace[]> {
  return loadRaw();
}

export async function isFavorite(placeId: string): Promise<boolean> {
  if (!placeId) return false;
  const items = await loadRaw();
  return items.some((item) => item.id === placeId);
}

export async function addFavorite(place: any): Promise<boolean> {
  const snapshot = toSnapshot(place);
  if (!snapshot) return false;
  const items = await loadRaw();
  const next = [
    { id: snapshot.id, savedAt: Date.now(), place: snapshot },
    ...items.filter((item) => item.id !== snapshot.id),
  ];
  await saveRaw(next);
  return true;
}

export async function removeFavorite(placeId: string): Promise<void> {
  if (!placeId) return;
  const items = await loadRaw();
  await saveRaw(items.filter((item) => item.id !== placeId));
}

export async function toggleFavorite(place: any): Promise<boolean> {
  const id = typeof place?.id === 'string' ? place.id : '';
  if (!id) return false;
  const items = await loadRaw();
  if (items.some((item) => item.id === id)) {
    await saveRaw(items.filter((item) => item.id !== id));
    return false;
  }
  return addFavorite(place);
}
