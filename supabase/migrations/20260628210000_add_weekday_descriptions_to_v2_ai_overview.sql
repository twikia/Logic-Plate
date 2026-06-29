ALTER TABLE v2_ai_overview_cache
  ADD COLUMN IF NOT EXISTS weekday_descriptions JSONB;
