import { SEARCH_CONFIG } from './searchConfig';
import type { CachedPlace } from './cacheManager';
import { getPlaceWebsiteUrl } from './placeFields';

const CONFIDENCE_ATTR_RE = /^Overture confidence:\s*([0-9]*\.?[0-9]+)\s*$/i;

export function parseConfidenceFromAttributes(attributes?: string[] | null): number | undefined {
  if (!attributes?.length) return undefined;
  for (const line of attributes) {
    const m = String(line ?? '').trim().match(CONFIDENCE_ATTR_RE);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function getPlaceConfidence(place: {
  confidence?: number | null;
  attributes?: string[] | null;
}): number | undefined {
  if (typeof place.confidence === 'number' && Number.isFinite(place.confidence)) {
    return place.confidence;
  }
  return parseConfidenceFromAttributes(place.attributes);
}

export function isPermanentlyClosedPlace(place: {
  operating_status?: string | null;
  businessStatus?: string | null;
}): boolean {
  const operating = String(place.operating_status || '').toLowerCase();
  if (operating === 'permanently_closed') return true;
  const business = String(place.businessStatus || '').toUpperCase();
  return business === 'CLOSED_PERMANENTLY';
}

/** Drop junk / gone places before they reach map, home, or ranking. */
export function isUsablePlace(place: CachedPlace | any): boolean {
  if (!place?.id || !place?.name || place?.location?.latitude == null) return false;
  if (isPermanentlyClosedPlace(place)) return false;
  if (!getPlaceWebsiteUrl(place)) return false;
  const confidence = getPlaceConfidence(place);
  if (
    typeof confidence === 'number' &&
    confidence < SEARCH_CONFIG.MIN_OVERTURE_CONFIDENCE
  ) {
    return false;
  }
  return true;
}

export function filterUsablePlaces<T>(
  places: T[],
  rejectedIds?: Set<string>
): T[] {
  return places.filter((place) => {
    const id = (place as { id?: string })?.id;
    if (id && rejectedIds?.has(id)) return false;
    return isUsablePlace(place);
  });
}
