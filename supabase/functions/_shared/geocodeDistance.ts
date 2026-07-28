/** Forward-geocode an address and compare to the Overture pin (Photon, no API key). */

import { haversineMeters } from './allThePlacesHours.ts';

export const MAX_GEOCODE_DISTANCE_METERS = 150;
const PHOTON_URL = 'https://photon.komoot.io/api/';
const GEOCODE_TIMEOUT_MS = 2500;

export type GeocodeDistanceVerdict =
  | { kind: 'pass' }
  | { kind: 'skip' }
  | { kind: 'reject'; distanceMeters: number }
  | { kind: 'error'; message: string };

function buildAddressQuery(parts: {
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string | null {
  const bits = [parts.address, parts.city, parts.region, parts.postcode, parts.country]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (bits.length === 0) return null;
  const q = bits.join(', ');
  if (q.length < 8) return null;
  if (!parts.address || String(parts.address).trim().length < 5) return null;
  return q;
}

async function photonGeocode(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Platebound/2.0 (geocode-distance-gate; contact: support@platebound.app)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = await res.json();
    const feature = Array.isArray(raw?.features) ? raw.features[0] : null;
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * If the address geocodes successfully and is farther than MAX from the pin,
 * the Overture location is treated as wrong. Geocode failures skip (fail-open).
 */
export async function checkGeocodeDistance(input: {
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  maxDistanceMeters?: number;
}): Promise<GeocodeDistanceVerdict> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { kind: 'skip' };
  }
  const query = buildAddressQuery(input);
  if (!query) return { kind: 'skip' };

  const geo = await photonGeocode(query);
  if (!geo) return { kind: 'skip' };

  const dist = haversineMeters(input.lat, input.lng, geo.lat, geo.lng);
  const max = input.maxDistanceMeters ?? MAX_GEOCODE_DISTANCE_METERS;
  if (dist > max) {
    return { kind: 'reject', distanceMeters: Math.round(dist) };
  }
  return { kind: 'pass' };
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}
