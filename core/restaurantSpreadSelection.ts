import { SEARCH_CONFIG } from './searchConfig';
import { getRes7CellId } from './h3Utils';
import type { CachedPlace } from './cacheManager';

export type ScoredPlace = CachedPlace & {
  /** Distance from the user — used for radius cutoff and UI display. */
  distanceMeters: number;
  /** H3 res-7 cell this place was loaded from (stable selection anchor). */
  sourceCellId: string;
  /** Distance from the source cell center — used for spread ranking only. */
  cellDistanceMeters: number;
};

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const bearingRadians = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  let theta = Math.atan2(y, x);
  if (theta < 0) theta += 2 * Math.PI;
  return theta;
};

function spatialBucket(
  distanceMeters: number,
  bearing: number,
  maxRadiusMeters: number,
  numRings: number,
  numSectors: number
): { ring: number; sector: number } {
  const ratio = maxRadiusMeters > 0 ? Math.min(1, distanceMeters / maxRadiusMeters) : 0;
  const ring =
    ratio >= 1
      ? numRings - 1
      : Math.min(numRings - 1, Math.floor(ratio * numRings));
  const sector = Math.min(numSectors - 1, Math.floor((bearing / (2 * Math.PI)) * numSectors));
  return { ring, sector };
}

function compareWithinBucket(a: ScoredPlace, b: ScoredPlace): number {
  const d = a.cellDistanceMeters - b.cellDistanceMeters;
  if (d !== 0) return d;
  return a.id.localeCompare(b.id);
}

function resolveSourceCellId(
  place: CachedPlace,
  explicitCellId: string | undefined,
  searchCellSet: Set<string>
): string | null {
  if (explicitCellId && searchCellSet.has(explicitCellId)) return explicitCellId;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat == null || lng == null) return null;
  const containing = getRes7CellId(lat, lng);
  return searchCellSet.has(containing) ? containing : null;
}

/**
 * Dedupe and keep only places within the user's search radius.
 * User location is used only for this cutoff; ranking uses cell centers later.
 */
export function placesWithinRadius(
  rawPlaces: Array<CachedPlace & { sourceCellId?: string }>,
  userLat: number,
  userLng: number,
  maxRadiusMeters: number,
  searchCellIds: string[]
): ScoredPlace[] {
  const searchCellSet = new Set(searchCellIds);
  const uniqueMap = new Map<string, ScoredPlace>();

  for (const place of rawPlaces) {
    if (!place.id || uniqueMap.has(place.id)) continue;
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (lat == null || lng == null) continue;

    const distanceMeters = haversineDistance(userLat, userLng, lat, lng);
    if (distanceMeters > maxRadiusMeters) continue;

    const sourceCellId = resolveSourceCellId(place, place.sourceCellId, searchCellSet);
    if (!sourceCellId) continue;

    uniqueMap.set(place.id, {
      ...place,
      distanceMeters,
      sourceCellId,
      cellDistanceMeters: 0,
    });
  }

  return Array.from(uniqueMap.values());
}

/**
 * Pick up to `limit` places with even spread per H3 cell.
 *
 * Each place is binned into rings × sectors around its **source cell center**
 * (not the user). Within each bin, nearest-to-cell-center ranks first.
 * Bins round-robin fill so every cell and distance band contributes.
 *
 * Stable for the same search cells + search radius + cached data even if the
 * user moves slightly within a cell. Changes when cells or radius change.
 */
export function selectSpreadPlaces(
  places: ScoredPlace[],
  searchCellIds: string[],
  cellCenters: Map<string, [number, number]>,
  limit: number = SEARCH_CONFIG.MAX_DISPLAY_RESULTS,
  numRings: number = SEARCH_CONFIG.SPREAD_NUM_RINGS,
  numSectors: number = SEARCH_CONFIG.SPREAD_NUM_SECTORS
): ScoredPlace[] {
  const cellRank = new Map(searchCellIds.map((id, index) => [id, index]));
  const cellRadius = SEARCH_CONFIG.OVERTURE_SEARCH_RADIUS_METERS;

  const scored: ScoredPlace[] = [];
  for (const place of places) {
    const center = cellCenters.get(place.sourceCellId);
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!center || lat == null || lng == null) continue;
    const [cellLat, cellLng] = center;
    scored.push({
      ...place,
      cellDistanceMeters: haversineDistance(cellLat, cellLng, lat, lng),
    });
  }

  if (scored.length <= limit) {
    return [...scored].sort((a, b) => {
      const cellOrder =
        (cellRank.get(a.sourceCellId) ?? 999) - (cellRank.get(b.sourceCellId) ?? 999);
      if (cellOrder !== 0) return cellOrder;
      return compareWithinBucket(a, b);
    });
  }

  const buckets = new Map<string, ScoredPlace[]>();

  for (const place of scored) {
    const center = cellCenters.get(place.sourceCellId)!;
    const [cellLat, cellLng] = center;
    const lat = place.location!.latitude!;
    const lng = place.location!.longitude!;
    const bearing = bearingRadians(cellLat, cellLng, lat, lng);
    const { ring, sector } = spatialBucket(
      place.cellDistanceMeters,
      bearing,
      cellRadius,
      numRings,
      numSectors
    );
    const key = `${place.sourceCellId}-${ring}-${sector}`;
    const group = buckets.get(key);
    if (group) group.push(place);
    else buckets.set(key, [place]);
  }

  for (const group of buckets.values()) {
    group.sort(compareWithinBucket);
  }

  const bucketKeys = [...buckets.keys()].sort((a, b) => {
    const parseKey = (key: string) => {
      const parts = key.split('-');
      const sector = Number(parts.pop());
      const ring = Number(parts.pop());
      const cellId = parts.join('-');
      return { cellId, ring, sector };
    };
    const ka = parseKey(a);
    const kb = parseKey(b);
    const cellOrder = (cellRank.get(ka.cellId) ?? 999) - (cellRank.get(kb.cellId) ?? 999);
    return cellOrder || ka.ring - kb.ring || ka.sector - kb.sector;
  });

  const selected: ScoredPlace[] = [];
  let round = 0;
  while (selected.length < limit) {
    let addedThisRound = false;
    for (const key of bucketKeys) {
      if (selected.length >= limit) break;
      const group = buckets.get(key)!;
      if (round < group.length) {
        selected.push(group[round]);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
    round++;
  }

  return selected;
}
