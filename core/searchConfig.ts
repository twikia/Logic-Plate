/**
 * Central configuration for restaurant search, H3 grid, and API call limits.
 *
 * NOTE: CELL_SEARCH_RADIUS_BY_RESOLUTION in supabase/functions/fetch-restaurants/index.ts
 * mirrors the values here — update both if you change search radii.
 */
export const SEARCH_CONFIG = {
  // ── Radius Cap ─────────────────────────────────────────────────────────────
  MAX_RADIUS_METERS: 24140, // 15 miles — hard cap applied before every search

  // ── Resolution Selection (80% Circle Coverage Rule) ────────────────────────
  // The search resolution is chosen such that the 7-cell kRing(1) cluster covers
  // at least 80% of the search circle area.
  //
  // Coverage ≈ min(1, (cluster_radius / search_radius)²)
  //
  // Cluster radii below approximate the outer reach of 7 contiguous hexagons:
  //   Res 8: ~1260m cluster radius → qualifies for R ≤ 1408m (~0.87 mi)
  //   Res 7: ~3333m cluster radius → qualifies for R ≤ 3726m (~2.3 mi)
  //   Res 6: ~8820m cluster radius → qualifies for larger radii
  CELL_COVERAGE_THRESHOLD: 0.80,
  CLUSTER_RADIUS_BY_RESOLUTION: {
    8: 1260,
    7: 3333,
    6: 8820,
  } as const,

  // Hard cap on Google API calls per search (= number of H3 cells fetched)
  MAX_CELLS: 7 as const,
  CELLS_PER_SEARCH: 7 as const,

  // ── Google Places API ──────────────────────────────────────────────────────
  // Search radius (meters) passed to Google Places for each H3 cell.
  // Mirrored in supabase/functions/fetch-restaurants/index.ts.
  CELL_SEARCH_RADIUS_BY_RESOLUTION: {
    8: 1260,
    7: 3333,
    6: 8820,
  } as const,

  // Max results per Google API call (Google's hard cap)
  PLACES_MAX_RESULTS_PER_CELL: 20,
} as const;
