-- Per-location opening hours from AllThePlaces (CC-0) for name+proximity match.
CREATE TABLE IF NOT EXISTS v2_atp_place_hours (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT        NOT NULL,
  brand          TEXT,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  opening_hours  TEXT        NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE v2_atp_place_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_atp_place_hours_public_read"
  ON v2_atp_place_hours
  FOR SELECT
  USING (true);

CREATE POLICY "v2_atp_place_hours_service_write"
  ON v2_atp_place_hours
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_atp_place_hours_lat_lng
  ON v2_atp_place_hours (lat, lng);

CREATE INDEX IF NOT EXISTS idx_v2_atp_place_hours_name_lower
  ON v2_atp_place_hours (lower(name));
