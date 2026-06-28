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
 * Returns the H3 resolution appropriate for the given search radius based on the 80% coverage rule.
 * Tests resolutions from finest (8) to coarsest (6).
 */
export function getSearchResolution(radiusMeters: number): number {
  const r8Cover = Math.min(1, Math.pow(SEARCH_CONFIG.CLUSTER_RADIUS_BY_RESOLUTION[8] / radiusMeters, 2));
  if (r8Cover >= SEARCH_CONFIG.CELL_COVERAGE_THRESHOLD) return 8;

  const r7Cover = Math.min(1, Math.pow(SEARCH_CONFIG.CLUSTER_RADIUS_BY_RESOLUTION[7] / radiusMeters, 2));
  if (r7Cover >= SEARCH_CONFIG.CELL_COVERAGE_THRESHOLD) return 7;

  return 6;
}

/**
 * Returns the Google Places search radius (metres) for a given H3 resolution.
 */
export function getCellSearchRadius(resolution: number): number {
  if (resolution === 8) return SEARCH_CONFIG.CELL_SEARCH_RADIUS_BY_RESOLUTION[8];
  if (resolution === 7) return SEARCH_CONFIG.CELL_SEARCH_RADIUS_BY_RESOLUTION[7];
  if (resolution === 6) return SEARCH_CONFIG.CELL_SEARCH_RADIUS_BY_RESOLUTION[6];
  return 1260;
}

/**
 * Returns all res-8 cells within a radius (used for group session cell overlap checks).
 */
export const getCellsInRadius = (lat: number, lng: number, radiusMeters: number): string[] => {
  const centerCell = getRes8CellId(lat, lng);
  const ringSize = Math.ceil(radiusMeters / 1300);
  return h3.kRing(centerCell, ringSize);
};

/**
 * Returns exactly 7 H3 cells (kRing 1) for the restaurant search pipeline.
 *
 * Resolution is dynamically chosen using the 80% area coverage rule.
 * The 7 cells are sorted by distance from the user position to cell center.
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

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const sorted = ring.slice().sort((a: string, b: string) => {
    const [latA, lngA] = getCellCenter(a);
    const [latB, lngB] = getCellCenter(b);
    const dA = (latA - lat) ** 2 + ((lngA - lng) * cosLat) ** 2;
    const dB = (latB - lat) ** 2 + ((lngB - lng) * cosLat) ** 2;
    return dA - dB;
  });

  // Take up to MAX_CELLS (7)
  const cellIds = sorted.slice(0, SEARCH_CONFIG.MAX_CELLS);
  return { cellIds, resolution };
};

/**
 * Returns all immediate child cells of a given cell at childRes resolution.
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
