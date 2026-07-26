-- Persistent website scrape cache so cell warm-up can scrape many places once
-- and later AI overview requests reuse menu/hours text without re-fetching HTML.
CREATE TABLE IF NOT EXISTS v2_website_scrape_cache (
  gers_id                      TEXT        PRIMARY KEY,
  website_url                  TEXT,
  menu_text                    TEXT,
  hours_text                   TEXT,
  json_ld_weekday_descriptions JSONB,
  is_dead                      BOOLEAN     NOT NULL DEFAULT false,
  scraped_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE v2_website_scrape_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_website_scrape_cache_public_read"
  ON v2_website_scrape_cache
  FOR SELECT
  USING (true);

CREATE POLICY "v2_website_scrape_cache_service_write"
  ON v2_website_scrape_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_v2_website_scrape_cache_scraped_at
  ON v2_website_scrape_cache (scraped_at);

CREATE INDEX IF NOT EXISTS idx_v2_website_scrape_cache_is_dead
  ON v2_website_scrape_cache (is_dead)
  WHERE is_dead = true;
