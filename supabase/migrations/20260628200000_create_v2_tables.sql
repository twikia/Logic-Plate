-- ============================================================
-- V2 Tables: Overture Maps + Unified AI Overview Pipeline
-- ============================================================
-- These tables replace restaurant_cache and ai_overview_cache
-- using GERS IDs (Overture Maps Global Entity Reference System)
-- as the primary key instead of Google Place IDs.
-- Voting tables and auth tables are NOT touched.
-- ============================================================

-- ── V2 Restaurant Cell Cache ─────────────────────────────────
-- Stores Overture Maps place data grouped by H3 cell ID.
-- The `restaurants` JSONB array contains normalized Overture
-- place objects keyed by their GERS ID (`id` field).
CREATE TABLE IF NOT EXISTS v2_restaurant_cell_cache (
  id          TEXT        PRIMARY KEY,  -- H3 cell ID (e.g. "872a1072dffffff")
  restaurants JSONB       NOT NULL,     -- Array of normalized Overture place objects
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE v2_restaurant_cell_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_cell_cache_public_read"
  ON v2_restaurant_cell_cache
  FOR SELECT
  USING (true);

-- Service role only writes (edge functions use service role key)
CREATE POLICY "v2_cell_cache_service_write"
  ON v2_restaurant_cell_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_restaurant_cell_cache_fetched_at
  ON v2_restaurant_cell_cache (fetched_at);


-- ── V2 AI Overview Cache ──────────────────────────────────────
-- Unified cache for all AI-generated data per restaurant:
--   - Scores (same 22 fields as before)
--   - Top menu items extracted from website scraping
--   - Price tier (1-4) and cuisine key
-- Primary key is the GERS ID from Overture Maps.
CREATE TABLE IF NOT EXISTS v2_ai_overview_cache (
  gers_id                  TEXT        PRIMARY KEY,  -- Overture GERS ID (UUID format)

  -- ── AI Scores (same schema as ai_overview_cache) ──────────
  summary_good_bad         TEXT,
  speed_score              INTEGER,
  health_score             NUMERIC(4,2),
  workout_recovery_score   INTEGER,
  processed_score          INTEGER,
  calorie_score            INTEGER,
  protein_score            INTEGER,
  carb_score               INTEGER,
  date_worthiness          INTEGER,
  noise_level_estimate     INTEGER,
  group_size_sweet_spot    INTEGER,
  absolute_macros          TEXT,
  who_this_place_is_for    TEXT,
  taste_score              INTEGER      NOT NULL DEFAULT 0,
  value_for_money_score    INTEGER      NOT NULL DEFAULT 0,
  hungover_recovery_score  INTEGER      NOT NULL DEFAULT 0,
  munchy_score             INTEGER      NOT NULL DEFAULT 0,
  variety_score            INTEGER      NOT NULL DEFAULT 0,
  macro_friendly_score     INTEGER      NOT NULL DEFAULT 0,
  solo_diner_score         INTEGER      NOT NULL DEFAULT 0,
  energy_sustain_score     INTEGER      NOT NULL DEFAULT 0,
  work_friendly_score      INTEGER      NOT NULL DEFAULT 0,

  -- ── Unified Menu + Pricing (merged from generate-ai-menus) ─
  top_menu_items           JSONB,        -- [{name, price, overview}] up to 4 items
  price_tier               INTEGER,      -- 1=budget, 2=moderate, 3=pricey, 4=fine dining
  cuisine_key              TEXT,         -- e.g. "italian", "mexican", "american"

  -- ── Metadata ───────────────────────────────────────────────
  website_url              TEXT,         -- The URL that was scraped (if any)
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE v2_ai_overview_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_ai_overview_public_read"
  ON v2_ai_overview_cache
  FOR SELECT
  USING (true);

CREATE POLICY "v2_ai_overview_service_write"
  ON v2_ai_overview_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_ai_overview_updated_at
  ON v2_ai_overview_cache (updated_at);

CREATE INDEX IF NOT EXISTS idx_v2_ai_overview_cuisine
  ON v2_ai_overview_cache (cuisine_key);
