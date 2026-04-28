/**
 * Phase 2: H3 Cell Utilities Module (Using h3-js v3 for React Native Compatibility)
 */

// Polyfill 1: h3-js emscripten build checks for document.currentScript on load
if (typeof (global as any).document === 'undefined') {
  (global as any).document = { currentScript: null };
}

// Polyfill 2: Temporarily hide Expo's limited TextDecoder so h3-js falls back to its own
const _savedDecoder = (global as any).TextDecoder;
(global as any).TextDecoder = undefined;

const h3 = require('h3-js');

(global as any).TextDecoder = _savedDecoder;


/**
 * Takes a lat/lng and returns the resolution 7 cell ID for that point.
 */
export const getRes7CellId = (lat: number, lng: number): string => {
  return h3.geoToH3(lat, lng, 7);
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
 * Ring size of Math.ceil(radiusMeters / 1400) gives approx coverage.
 */
export const getCellsInRadius = (lat: number, lng: number, radiusMeters: number): string[] => {
  const centerCell = getRes7CellId(lat, lng);
  const ringSize = Math.ceil(radiusMeters / 1400);
  return h3.kRing(centerCell, ringSize);
};
