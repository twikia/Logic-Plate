/**
 * Phase 2: H3 Cell Utilities Module (Using h3-js v3 for React Native Compatibility)
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
 * Takes a lat/lng and returns the resolution 8 cell ID for that point.
 */
export const getRes8CellId = (lat: number, lng: number): string => {
  return h3.geoToH3(lat, lng, SEARCH_CONFIG.H3_RESOLUTION);
};

/**
 * Takes a cell ID and returns the lat/lng of that cell's geographic center.
 */
export const getCellCenter = (cellId: string): [number, number] => {
  // h3-js v3 returns [lat, lng] array
  const coords = h3.h3ToGeo(cellId);
  return [coords[0], coords[1]];
};

/**
 * Takes a user lat/lng and a desired search radius in meters and returns
 * the set of all cell IDs whose centers fall within that radius.
 *
 * Uses H3 resolution 8 (~1.3 km center-to-center between neighbors).
 *   k=1 (7 cells)  → covers the 0.8-mile search area
 *   k=2 (19 cells) → covers the 1.5-mile search area
 */
export const getCellsInRadius = (lat: number, lng: number, radiusMeters: number): string[] => {
  const centerCell = getRes8CellId(lat, lng);
  const ringSize = Math.ceil(radiusMeters / SEARCH_CONFIG.CELL_SPACING_METERS);
  return h3.kRing(centerCell, ringSize);
};

export function getMacroResolutionAndRadius(radiusMeters: number): { resolution: number; cellSpacingMeters: number; placeSearchRadius: number } {
  if (radiusMeters <= 2253) {
    return { resolution: 8, cellSpacingMeters: 1300, placeSearchRadius: 600 };
  } else if (radiusMeters <= 8046) {
    return { resolution: 7, cellSpacingMeters: 2800, placeSearchRadius: 1500 };
  } else {
    return { resolution: 6, cellSpacingMeters: 7400, placeSearchRadius: 4000 };
  }
}

export const getCellsInRadiusDynamic = (lat: number, lng: number, radiusMeters: number): { cellIds: string[], resolution: number } => {
  const { resolution, cellSpacingMeters } = getMacroResolutionAndRadius(radiusMeters);
  const centerCell = h3.geoToH3(lat, lng, resolution);
  const ringSize = Math.ceil(radiusMeters / cellSpacingMeters);
  const cellIds = h3.kRing(centerCell, ringSize);
  return { cellIds, resolution };
};
