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

const H3_RES = SEARCH_CONFIG.H3_RESOLUTION;

/**
 * Returns the geographic centre [lat, lng] of an H3 cell.
 */
export const getCellCenter = (cellId: string): [number, number] => {
  const coords = h3.h3ToGeo(cellId);
  return [coords[0], coords[1]];
};

/**
 * Returns the res-7 H3 cell containing a lat/lng point.
 */
export const getRes7CellId = (lat: number, lng: number): string =>
  h3.geoToH3(lat, lng, H3_RES);

/**
 * Returns cell centers for a list of cell IDs.
 */
export const getCellCentersMap = (cellIds: string[]): Map<string, [number, number]> => {
  const map = new Map<string, [number, number]>();
  for (const cellId of cellIds) {
    map.set(cellId, getCellCenter(cellId));
  }
  return map;
};

/**
 * Returns res-7 H3 cells covering the user's search radius.
 * - Small radius (≤ inscribed): 1 cell (user's containing hex)
 * - Larger radius: kRing(1) = 7 cells, sorted by cell id for stable ordering
 */
export const getSearchCells = (
  lat: number,
  lng: number,
  radiusMeters: number
): string[] => {
  const centerCell = h3.geoToH3(lat, lng, H3_RES);

  if (radiusMeters <= SEARCH_CONFIG.RES7_INSCRIBED_RADIUS_METERS) {
    return [centerCell];
  }

  const ring: string[] = h3.kRing(centerCell, 1);
  return ring.slice().sort();
};

/**
 * Returns res-7 cells within a radius (group session cell overlap checks).
 */
export const getCellsInRadius = (lat: number, lng: number, radiusMeters: number): string[] =>
  getSearchCells(lat, lng, radiusMeters);
