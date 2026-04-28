import { latLngToCell, cellToLatLng, gridDisk } from 'h3-js';

/**
 * Phase 2: H3 Cell Utilities Module
 */

/**
 * Takes a lat/lng and returns the resolution 7 cell ID for that point.
 */
export const getRes7CellId = (lat: number, lng: number): string => {
  return latLngToCell(lat, lng, 7);
};

/**
 * Takes a cell ID and returns the lat/lng of that cell's geographic center.
 */
export const getCellCenter = (cellId: string): [number, number] => {
  // h3-js returns [lat, lng] array
  const coords = cellToLatLng(cellId);
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
  return gridDisk(centerCell, ringSize);
};
