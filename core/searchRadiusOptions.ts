export function milesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export const MIN_SEARCH_RADIUS_METERS = milesToMeters(0.4);
export const MAX_SEARCH_RADIUS_METERS = milesToMeters(25.0);
export const DEFAULT_SEARCH_RADIUS_METERS = milesToMeters(0.6);

export function clampSearchRadius(meters: number): number {
  return Math.max(MIN_SEARCH_RADIUS_METERS, Math.min(MAX_SEARCH_RADIUS_METERS, meters));
}
