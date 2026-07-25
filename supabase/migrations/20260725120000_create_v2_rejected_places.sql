-- Tombstones for places we should never surface-ingest (no website, dead website, low confidence).
CREATE TABLE IF NOT EXISTS v2_rejected_places (
  gers_id    TEXT        PRIMARY KEY,
  reason     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE v2_rejected_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_rejected_places_public_read"
  ON v2_rejected_places
  FOR SELECT
  USING (true);

CREATE POLICY "v2_rejected_places_public_insert"
  ON v2_rejected_places
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "v2_rejected_places_service_write"
  ON v2_rejected_places
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_rejected_places_created_at
  ON v2_rejected_places (created_at);
