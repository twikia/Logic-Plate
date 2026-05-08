-- Phase 1: Supabase Schema for Restaurant Caching

CREATE TABLE restaurant_cache (
    id TEXT PRIMARY KEY,
    restaurants JSONB NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE restaurant_cache ENABLE ROW LEVEL SECURITY;

-- Public Read Access: Anyone can read from the cache
CREATE POLICY "Allow public read access" 
ON restaurant_cache 
FOR SELECT 
USING (true);

-- Service Role Only Writes: Only the backend or service role can write/upsert
-- (If you meant for the React Native app to write directly right now, you will need to allow Anon inserts.
-- You can uncomment the below lines if you want the app to be able to upsert directly using the Anon key during testing).

-- CREATE POLICY "Allow anon upserts for testing"
-- ON restaurant_cache
-- FOR ALL
-- USING (true)
-- WITH CHECK (true);

-- Index for future cache invalidation
CREATE INDEX idx_restaurant_cache_fetched_at ON restaurant_cache (fetched_at);

CREATE TABLE ai_overview_cache (
    place_id TEXT PRIMARY KEY,
    summary_good_bad TEXT,
    speed_score NUMERIC(4,2),
    health_score NUMERIC(4,2),
    workout_recovery_score INTEGER,
    processed_score INTEGER,
    calorie_score INTEGER,
    protein_score INTEGER,
    carb_score INTEGER,
    date_worthiness INTEGER,
    noise_level_estimate INTEGER,
    group_size_sweet_spot INTEGER,
    absolute_macros TEXT,
    who_this_place_is_for TEXT,
    taste_score INTEGER NOT NULL DEFAULT 0,
    value_for_money_score INTEGER NOT NULL DEFAULT 0,
    hungover_recovery_score INTEGER NOT NULL DEFAULT 0,
    munchy_score INTEGER NOT NULL DEFAULT 0,
    variety_score INTEGER NOT NULL DEFAULT 0,
    macro_friendly_score INTEGER NOT NULL DEFAULT 0,
    solo_diner_score INTEGER NOT NULL DEFAULT 0,
    energy_sustain_score INTEGER NOT NULL DEFAULT 0,
    work_friendly_score INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE ai_overview_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to ai overview cache"
ON ai_overview_cache
FOR SELECT
USING (true);
