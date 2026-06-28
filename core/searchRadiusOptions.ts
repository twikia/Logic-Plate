import { SEARCH_CONFIG } from './searchConfig';

export function milesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export const MIN_SEARCH_RADIUS_METERS = milesToMeters(0.4);
export const MAX_SEARCH_RADIUS_METERS = SEARCH_CONFIG.MAX_RADIUS_METERS;
export const DEFAULT_SEARCH_RADIUS_METERS = milesToMeters(0.6);

export function clampSearchRadius(meters: number): number {
  return Math.max(MIN_SEARCH_RADIUS_METERS, Math.min(MAX_SEARCH_RADIUS_METERS, meters));
}

/**
 * Converts normalized slider position t in [0, 1] to radius in meters exponentially.
 * A power curve makes smaller exact distances easier to scroll to on the left side.
 */
export function sliderValueToRadius(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const raw = MIN_SEARCH_RADIUS_METERS + Math.pow(clamped, 2.2) * (MAX_SEARCH_RADIUS_METERS - MIN_SEARCH_RADIUS_METERS);
  return clampSearchRadius(Math.round(raw / 50) * 50);
}

/**
 * Converts radius in meters back to normalized slider position t in [0, 1].
 */
export function radiusToSliderValue(radius: number): number {
  const clamped = clampSearchRadius(radius);
  const fraction = (clamped - MIN_SEARCH_RADIUS_METERS) / (MAX_SEARCH_RADIUS_METERS - MIN_SEARCH_RADIUS_METERS);
  if (fraction <= 0) return 0;
  return Math.pow(fraction, 1 / 2.2);
}
