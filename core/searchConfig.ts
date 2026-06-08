/**
 * Central configuration for restaurant search, H3 grid, and API call limits.
 * Edit this file to adjust search behavior across the app and edge functions.
 *
 * NOTE: The edge function at supabase/functions/fetch-missing-cells/index.ts
 * mirrors PLACES_PER_CELL_RADIUS_METERS and PLACES_MAX_RESULTS_PER_CELL —
 * update both when changing those values.
 */
export const SEARCH_CONFIG = {
  // ── H3 Grid ───────────────────────────────────────────────────────────────
  H3_RESOLUTION: 8 as const,

  // Approximate center-to-center spacing between neighboring res-8 cells (~1.3 km).
  // Drives the kRing formula: Math.ceil(radiusMeters / CELL_SPACING_METERS)
  CELL_SPACING_METERS: 1300,

  // ── Small search: 0.8 miles — k=1 ring → 7 cells ─────────────────────────
  SMALL_RADIUS_METERS: 1287,   // 0.8 miles
  SMALL_RADIUS_K_RING: 1,
  SMALL_RADIUS_API_CAP: 7,     // max Google Places calls for this search size

  // ── Large search: 1.5 miles — k=2 ring → 19 cells (capped to 15 calls) ───
  LARGE_RADIUS_METERS: 2414,   // 1.5 miles
  LARGE_RADIUS_K_RING: 2,
  LARGE_RADIUS_API_CAP: 15,    // max Google Places calls for this search size

  // Hard cap applied to every radius before H3 cell computation
  MAX_RADIUS_METERS: 2414,     // 1.5 miles

  // ── Google Places API (per res-8 cell) ────────────────────────────────────
  // Mirrored in supabase/functions/fetch-missing-cells/index.ts
  PLACES_PER_CELL_RADIUS_METERS: 600,
  PLACES_MAX_RESULTS_PER_CELL: 20,
} as const;
