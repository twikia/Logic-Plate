-- ============================================================
-- Split absolute_macros / who_this_place_is_for out of
-- v2_ai_overview_cache into a separate v2_ai_overview_details
-- table. These are long free-text fields that aren't needed by
-- every list-view read of v2_ai_overview_cache.
-- ============================================================

CREATE TABLE IF NOT EXISTS v2_ai_overview_details (
  gers_id                TEXT        PRIMARY KEY REFERENCES v2_ai_overview_cache(gers_id) ON DELETE CASCADE,
  absolute_macros        TEXT,
  who_this_place_is_for  TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE v2_ai_overview_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_ai_overview_details_public_read"
  ON v2_ai_overview_details
  FOR SELECT
  USING (true);

CREATE POLICY "v2_ai_overview_details_service_write"
  ON v2_ai_overview_details
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_ai_overview_details_updated_at
  ON v2_ai_overview_details (updated_at);

-- Carry forward any existing data before dropping the source columns.
INSERT INTO v2_ai_overview_details (gers_id, absolute_macros, who_this_place_is_for, updated_at)
SELECT gers_id, absolute_macros, who_this_place_is_for, updated_at
FROM v2_ai_overview_cache
WHERE absolute_macros IS NOT NULL OR who_this_place_is_for IS NOT NULL
ON CONFLICT (gers_id) DO NOTHING;

ALTER TABLE v2_ai_overview_cache DROP COLUMN IF EXISTS absolute_macros;
ALTER TABLE v2_ai_overview_cache DROP COLUMN IF EXISTS who_this_place_is_for;
