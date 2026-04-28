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
