ALTER TABLE ai_overview_cache
  ADD COLUMN IF NOT EXISTS taste_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value_for_money_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hungover_recovery_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS munchy_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variety_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS macro_friendly_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS solo_diner_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS energy_sustain_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS work_friendly_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ai_overview_cache.taste_score IS 'AI taste quality 0-5';
COMMENT ON COLUMN ai_overview_cache.value_for_money_score IS 'Value for money 0-5; use Maps price level/range';
COMMENT ON COLUMN ai_overview_cache.hungover_recovery_score IS 'Hungover recovery 0-5';
COMMENT ON COLUMN ai_overview_cache.munchy_score IS 'Munchy / craving satisfaction 0-5';
COMMENT ON COLUMN ai_overview_cache.variety_score IS 'Menu variety 0-5';
COMMENT ON COLUMN ai_overview_cache.macro_friendly_score IS 'Ease of calorie / macro tracking 0-5';
COMMENT ON COLUMN ai_overview_cache.solo_diner_score IS 'Solo diner friendliness 0-5';
COMMENT ON COLUMN ai_overview_cache.energy_sustain_score IS 'Post-meal energy: 0 quick spike/crash, 5 slow sustained energy';
COMMENT ON COLUMN ai_overview_cache.work_friendly_score IS 'Laptop work suitability (wifi, outlets, vibe) 0-5';
