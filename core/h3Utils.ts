/**
 * H3 Cell Utilities Module (using h3-js v3 for React Native compatibility)
 */

import { Platform } from 'react-native';

// Polyfill 1: h3-js emscripten build checks for document.currentScript on load
if (Platform.OS !== 'web' && typeof (global as any).document === 'undefined') {
  (global as any).document = { currentScript: null };
}

// Polyfill 2: Temporarily hide Expo's limited TextDecoder so h3-js falls back to its own
const _savedDecoder = (global as any).TextDecoder;
(global as any).TextDecoder = undefined;

const h3 = require('h3-js');

(global as any).TextDecoder = _savedDecoder;

import { SEARCH_CONFIG } from './searchConfig';

/**
 * Returns the resolution-8 cell ID containing a lat/lng point.
 * Used for group sessions (cell overlap matching) and child cache joins.
 */
export const getRes8CellId = (lat: number, lng: number): string =>
  h3.geoToH3(lat, lng, 8);

/**
 * Returns the geographic centre [lat, lng] of an H3 cell.
 */
export const getCellCenter = (cellId: string): [number, number] => {
  // h3-js v3 returns [lat, lng]
  const coords = h3.h3ToGeo(cellId);
  return [coords[0], coords[1]];
};

/**
 * Returns the H3 resolution appropriate for the given search radius.
 * - ≤ RES7_THRESHOLD_METERS (1.5 miles / 2414 m) → resolution 7 (~2.8 km spacing)
 * - above that threshold                         → resolution 6 (~7.4 km spacing)
 *
 * Resolution 8 is NEVER returned here — it is only used internally for child cache joins.
 */
export function getSearchResolution(radiusMeters: number): 7 | 6 {
  return radiusMeters <= SEARCH_CONFIG.RES7_THRESHOLD_METERS ? 7 : 6;
}

/**
 * Returns the Google Places search radius (metres) for a given H3 resolution.
 */
export function getCellSearchRadius(resolution: number): number {
  if (resolution === 7) return SEARCH_CONFIG.RES7_CELL_SEARCH_RADIUS_METERS;
  if (resolution === 6) return SEARCH_CONFIG.RES6_CELL_SEARCH_RADIUS_METERS;
  return 600; // fallback for res 8 (child join only, not normally called)
}

/**
 * Returns all res-8 cells within a radius (used for group session cell overlap checks).
 * NOT used by the restaurant search pipeline — see getCellsInRadiusDynamic instead.
 */
export const getCellsInRadius = (lat: number, lng: number, radiusMeters: number): string[] => {
  const centerCell = getRes8CellId(lat, lng);
  // Res-8 cell spacing is ~1.3 km centre-to-centre
  const ringSize = Math.ceil(radiusMeters / 1300);
  return h3.kRing(centerCell, ringSize);
};

/**
 * Returns exactly CELLS_PER_SEARCH (3) H3 cells for the restaurant search pipeline.
 *
 * Resolution is chosen so that a single cell's search radius (~1500 m for res 7,
 * ~4000 m for res 6) broadly covers the requested area. Three cells are then picked
 * from kRing(1) sorted by distance from the user, giving maximum area coverage
 * with minimum API calls:
 *
 *   kRing(1) = 7 cells (center + 6 neighbours)
 *   We take the 3 closest → centre cell + the 2 neighbours whose centres are
 *   nearest to the user's exact position.
 *
 * Resolution rules:
 *   ≤ 1.5 miles (2414 m) → res 7 (Google search radius 1500 m per cell)
 *   > 1.5 miles          → res 6 (Google search radius 4000 m per cell)
 *
 * Max Google API calls per session = CELLS_PER_SEARCH × MAX_PAGES = 3 × 3 = 9.
 */
export const getCellsInRadiusDynamic = (
  lat: number,
  lng: number,
  radiusMeters: number
): { cellIds: string[]; resolution: number } => {
  const resolution = getSearchResolution(radiusMeters);
  const centerCell = h3.geoToH3(lat, lng, resolution);

  // kRing(1) always gives 7 cells: the centre cell + 6 immediate hexagonal neighbours
  const ring: string[] = h3.kRing(centerCell, 1);

  // Sort by squared Euclidean distance (degrees) from user position to cell centre.
  // We apply a cosLat correction to the longitude delta so distances are comparable
  // across cells regardless of latitude.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const sorted = ring.slice().sort((a: string, b: string) => {
    const [latA, lngA] = getCellCenter(a);
    const [latB, lngB] = getCellCenter(b);
    const dA = (latA - lat) ** 2 + ((lngA - lng) * cosLat) ** 2;
    const dB = (latB - lat) ** 2 + ((lngB - lng) * cosLat) ** 2;
    return dA - dB;
  });

  // Take the 3 closest cells: centre + 2 nearest neighbours
  const cellIds = sorted.slice(0, SEARCH_CONFIG.CELLS_PER_SEARCH);
  return { cellIds, resolution };
};

/**
 * Returns all immediate child cells of a given cell at childRes resolution.
 * Used for the child-cache join (e.g. res-7 parent → res-8 children).
 */
export const getChildCells = (cellId: string, childRes: number): string[] =>
  h3.h3ToChildren(cellId, childRes);

/**
 * Clamps an arbitrary resolution to the supported cache resolutions (6, 7, 8).
 */
export const clampResolution = (res: number): number => {
  if (res >= 8) return 8;
  if (res <= 6) return 6;
  return 7;
};
