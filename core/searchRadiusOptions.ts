function milesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

/** Five presets from 0.4 mi to 1.5 mi (≈0.6–2.4 km). */
export const SEARCH_RADIUS_OPTIONS_METERS = [
  milesToMeters(0.4),
  milesToMeters(0.8),
  milesToMeters(1.0),
  milesToMeters(1.2),
  milesToMeters(1.5),
] as const;

export const MIN_SEARCH_RADIUS_METERS = SEARCH_RADIUS_OPTIONS_METERS[0];
export const MAX_SEARCH_RADIUS_METERS = SEARCH_RADIUS_OPTIONS_METERS[SEARCH_RADIUS_OPTIONS_METERS.length - 1];
export const DEFAULT_SEARCH_RADIUS_METERS = milesToMeters(0.8);

export function clampSearchRadius(meters: number): number {
  return Math.max(MIN_SEARCH_RADIUS_METERS, Math.min(MAX_SEARCH_RADIUS_METERS, meters));
}

export function nearestSearchRadiusOption(meters: number): number {
  const clamped = clampSearchRadius(meters);
  let best: number = SEARCH_RADIUS_OPTIONS_METERS[0];
  let bestDiff = Math.abs(clamped - best);
  for (const opt of SEARCH_RADIUS_OPTIONS_METERS) {
    const diff = Math.abs(clamped - opt);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}
