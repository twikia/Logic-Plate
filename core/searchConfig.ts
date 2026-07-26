/**
 * Central configuration for restaurant search and Overture API limits.
 *
 * NOTE: Overture per-cell limit in supabase/functions/v2-fetch-restaurants/index.ts
 * mirrors MAX_RESULTS_PER_CELL — update both if you change it.
 */
export const SEARCH_CONFIG = {
  // ── Radius Cap ─────────────────────────────────────────────────────────────

  // ── H3 Grid (resolution 7 only) ────────────────────────────────────────────
  H3_RESOLUTION: 7 as const,

  // Uber H3 spec: res-7 average hex edge length (m).
  RES7_EDGE_LENGTH_METERS: 1220.629071,

  // Inscribed radius (apothem) = edge × cos(30°) = edge × √3/2
  RES7_INSCRIBED_RADIUS_METERS: 1057.052559,

  // Largest circle (centered on the user's cell) that fits inside a kRing(1) cluster of 7 hexes.
  // On a flat hex lattice this equals √7 × apothem (~2797 m / ~1.74 mi).
  RES7_SEVEN_CELL_INSCRIBED_RADIUS_METERS: 2796.753037,

  // User search radius cap — cannot exceed what 7 res-7 cells can cover.
  MAX_RADIUS_METERS: 2796.753037,

  // Overture query radius matches the res-7 inscribed radius exactly.
  OVERTURE_SEARCH_RADIUS_METERS: 1057.052559,

  // 1 cell when search radius fits inside one hex; otherwise up to 7 (kRing 1).
  MAX_CELLS: 7 as const,

  // ── Overture Maps API ──────────────────────────────────────────────────────
  // High per-cell fetch so partial-cell searches (e.g. 0.6 mi) still fill the radius.
  // Raised after widening food categories — dense downtown cells were truncating.
  MAX_RESULTS_PER_CELL: 1500,
  // Max restaurants shown on the map / returned from a search.
  MAX_DISPLAY_RESULTS: 150,
  // Max restaurants that get AI overviews eagerly (closest first) on filtered pages.
  MAX_AI_OVERVIEWS: 60,
  // Gemini call size — map click prefetch and filtered-page generation use this.
  AI_GENERATION_BATCH_SIZE: 15,
  // Background website scrape fan-out after cell fetch (closest first).
  MAX_WEBSITE_SCRAPES: 1500,
  WEBSITE_SCRAPE_BATCH_SIZE: 40,

  // Overture existence confidence (0–1). Drop places below this when confidence is present.
  MIN_OVERTURE_CONFIDENCE: 0.9,

  // Polar grid for deterministic geographic spread (rings × sectors around the user).
  SPREAD_NUM_RINGS: 6,
  SPREAD_NUM_SECTORS: 12,
} as const;
