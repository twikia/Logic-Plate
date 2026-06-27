/**
 * Central configuration for restaurant search, H3 grid, and API call limits.
 * Edit this file to adjust search behavior across the app and edge functions.
 *
 * NOTE: SEARCH_RADIUS_BY_RESOLUTION in supabase/functions/fetch-restaurants/index.ts
 * mirrors RES7_CELL_SEARCH_RADIUS_METERS and RES6_CELL_SEARCH_RADIUS_METERS —
 * update both when changing those values.
 */
export const SEARCH_CONFIG = {
  // ── Radius Cap ─────────────────────────────────────────────────────────────
  // Hard cap applied to every radius before H3 cell computation.
  MAX_RADIUS_METERS: 2414, // 1.5 miles

  // ── H3 Resolution Selection ────────────────────────────────────────────────
  // Searches ≤ RES7_THRESHOLD_METERS use resolution 7 (cell spacing ~2.8 km).
  // Searches above that threshold use resolution 6 (cell spacing ~7.4 km).
  // Resolution 8 is NEVER used as an active search resolution — only for child cache joins.
  RES7_THRESHOLD_METERS: 2414, // ≤1.5 miles → res 7

  // Always 3 cells per search (center + 2 nearest neighbours from kRing(1)).
  CELLS_PER_SEARCH: 3 as const,

  // Maximum pages of results per session (same 3 cells, following Google nextPageToken).
  // Max Google Places API calls = CELLS_PER_SEARCH × MAX_PAGES = 9.
  MAX_PAGES: 3 as const,

  // ── Google Places API per cell ─────────────────────────────────────────────
  // Search radius passed to Google Places API per H3 resolution.
  // Mirrored in supabase/functions/fetch-restaurants/index.ts → SEARCH_RADIUS_BY_RESOLUTION.
  RES7_CELL_SEARCH_RADIUS_METERS: 1500,  // ~1 mile — covers a res-7 cell plus neighbours
  RES6_CELL_SEARCH_RADIUS_METERS: 4000,  // ~2.5 miles — covers a res-6 cell

  // Max results per Google Places API call (Google's hard cap is 20).
  PLACES_MAX_RESULTS_PER_CELL: 20,
} as const;
