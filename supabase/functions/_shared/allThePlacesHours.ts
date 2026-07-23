import { parseOsmOpeningHours } from './osmOpeningHours.ts';

/**
 * Chain opening hours derived from AllThePlaces (CC-0) / first-party store
 * locator patterns. Used when Overture has no usable OSM opening_hours tag.
 *
 * Keys are lowercase brand needles matched against place/brand names.
 * Values are OSM opening_hours strings.
 *
 * Refresh / expand with: node scripts/enrich-atp-hours-index.mjs
 */
const CHAIN_OPENING_HOURS: Array<{ needle: string; hours: string }> = [
  { needle: 'mcdonald', hours: 'Mo-Su 06:00-23:00' },
  { needle: 'starbucks', hours: 'Mo-Fr 05:30-21:00; Sa-Su 06:00-21:00' },
  { needle: 'dunkin', hours: 'Mo-Su 05:00-21:00' },
  { needle: 'subway', hours: 'Mo-Su 09:00-21:00' },
  { needle: 'chipotle', hours: 'Mo-Su 10:45-22:00' },
  { needle: 'taco bell', hours: 'Mo-Su 09:00-01:00' },
  { needle: 'wendy', hours: 'Mo-Su 06:30-01:00' },
  { needle: 'burger king', hours: 'Mo-Su 06:00-00:00' },
  { needle: 'kfc', hours: 'Mo-Su 10:30-22:00' },
  { needle: 'popeyes', hours: 'Mo-Su 10:00-22:00' },
  { needle: 'chick-fil-a', hours: 'Mo-Sa 06:30-22:00; Su off' },
  { needle: 'chickfila', hours: 'Mo-Sa 06:30-22:00; Su off' },
  { needle: 'pizza hut', hours: 'Mo-Su 11:00-23:00' },
  { needle: 'domino', hours: 'Mo-Su 10:00-01:00' },
  { needle: 'papa john', hours: 'Mo-Su 10:00-00:00' },
  { needle: 'little caesars', hours: 'Mo-Su 11:00-22:00' },
  { needle: 'five guys', hours: 'Mo-Su 11:00-22:00' },
  { needle: 'shake shack', hours: 'Mo-Su 11:00-22:00' },
  { needle: 'in-n-out', hours: 'Mo-Su 10:30-01:00' },
  { needle: 'in n out', hours: 'Mo-Su 10:30-01:00' },
  { needle: 'panera', hours: 'Mo-Su 07:00-21:00' },
  { needle: 'panda express', hours: 'Mo-Su 10:30-21:30' },
  { needle: 'olive garden', hours: 'Mo-Thu 11:00-22:00; Fr-Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'applebee', hours: 'Mo-Thu 11:00-00:00; Fr-Sa 11:00-01:00; Su 11:00-00:00' },
  { needle: "chili's", hours: 'Mo-Thu 11:00-23:00; Fr-Sa 11:00-00:00; Su 11:00-23:00' },
  { needle: 'chilis', hours: 'Mo-Thu 11:00-23:00; Fr-Sa 11:00-00:00; Su 11:00-23:00' },
  { needle: 'outback steakhouse', hours: 'Mo-Thu 11:00-22:00; Fr-Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'texas roadhouse', hours: 'Mo-Thu 15:00-22:00; Fr 15:00-23:00; Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'red lobster', hours: 'Mo-Thu 11:00-22:00; Fr-Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'ihop', hours: 'Mo-Su 06:00-00:00' },
  { needle: "denny's", hours: 'Mo-Su 00:00-24:00' },
  { needle: 'dennys', hours: 'Mo-Su 00:00-24:00' },
  { needle: 'waffle house', hours: 'Mo-Su 00:00-24:00' },
  { needle: 'cracker barrel', hours: 'Mo-Su 07:00-21:00' },
  { needle: 'buffalo wild wings', hours: 'Mo-Thu 11:00-00:00; Fr-Sa 11:00-01:00; Su 11:00-00:00' },
  { needle: 'wingstop', hours: 'Mo-Su 10:30-00:00' },
  { needle: 'raising cane', hours: 'Mo-Su 10:00-23:00' },
  { needle: 'culver', hours: 'Mo-Su 10:30-22:00' },
  { needle: 'whataburger', hours: 'Mo-Su 00:00-24:00' },
  { needle: 'sonic drive', hours: 'Mo-Su 06:00-00:00' },
  { needle: 'arby', hours: 'Mo-Su 10:00-22:00' },
  { needle: 'jimmy john', hours: 'Mo-Su 10:30-21:00' },
  { needle: 'jersey mike', hours: 'Mo-Su 10:00-21:00' },
  { needle: 'qdoba', hours: 'Mo-Su 10:30-21:00' },
  { needle: "moe's southwest", hours: 'Mo-Su 10:30-21:00' },
  { needle: 'moes southwest', hours: 'Mo-Su 10:30-21:00' },
  { needle: 'tim hortons', hours: 'Mo-Su 05:00-22:00' },
  { needle: 'krispy kreme', hours: 'Mo-Su 06:00-22:00' },
  { needle: 'dairy queen', hours: 'Mo-Su 11:00-22:00' },
  { needle: 'baskin robbins', hours: 'Mo-Su 11:00-22:00' },
  { needle: "carl's jr", hours: 'Mo-Su 06:00-23:00' },
  { needle: 'carls jr', hours: 'Mo-Su 06:00-23:00' },
  { needle: 'hardee', hours: 'Mo-Su 06:00-23:00' },
  { needle: 'jack in the box', hours: 'Mo-Su 00:00-24:00' },
  { needle: 'white castle', hours: 'Mo-Su 00:00-24:00' },
  { needle: 'cheesecake factory', hours: 'Mo-Thu 11:00-23:00; Fr-Sa 11:00-00:30; Su 10:00-23:00' },
  { needle: "p.f. chang", hours: 'Mo-Thu 11:00-22:00; Fr-Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'pf chang', hours: 'Mo-Thu 11:00-22:00; Fr-Sa 11:00-23:00; Su 11:00-22:00' },
  { needle: 'first watch', hours: 'Mo-Su 07:00-14:30' },
  { needle: 'yard house', hours: 'Mo-Thu 11:00-00:00; Fr-Sa 11:00-01:00; Su 11:00-00:00' },
].sort((a, b) => b.needle.length - a.needle.length);

export function lookupChainOpeningHours(
  name: string | null | undefined,
  brand?: string | null,
): string[] {
  const haystack = [name, brand]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .toLowerCase();
  if (!haystack) return [];

  for (const { needle, hours } of CHAIN_OPENING_HOURS) {
    if (haystack.includes(needle.trim().toLowerCase())) {
      return parseOsmOpeningHours(hours);
    }
  }
  return [];
}

/**
 * Haversine distance in meters — used when matching ATP dump features by coords.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type AtpFeatureLike = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    brand?: string;
    opening_hours?: string;
    'addr:city'?: string;
  };
};

/**
 * Match a place against AllThePlaces GeoJSON features by name similarity +
 * proximity (default 120 m). Returns parsed weekdayDescriptions or [].
 */
export function matchAtpOpeningHours(
  placeName: string,
  lat: number,
  lng: number,
  features: AtpFeatureLike[],
  maxDistanceMeters = 120,
): string[] {
  const needle = placeName.toLowerCase().trim();
  if (!needle || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  let best: { dist: number; hours: string } | null = null;
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [fLng, fLat] = coords;
    if (typeof fLat !== 'number' || typeof fLng !== 'number') continue;

    const props = feature.properties ?? {};
    const candidateName = String(props.name || props.brand || '').toLowerCase();
    if (!candidateName) continue;

    const nameHit =
      candidateName.includes(needle) ||
      needle.includes(candidateName) ||
      (props.brand && needle.includes(String(props.brand).toLowerCase()));
    if (!nameHit) continue;

    const hours = props.opening_hours;
    if (typeof hours !== 'string' || !hours.trim()) continue;

    const dist = haversineMeters(lat, lng, fLat, fLng);
    if (dist > maxDistanceMeters) continue;
    if (!best || dist < best.dist) best = { dist, hours: hours.trim() };
  }

  return best ? parseOsmOpeningHours(best.hours) : [];
}
