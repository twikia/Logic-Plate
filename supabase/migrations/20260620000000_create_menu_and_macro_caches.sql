-- Create new tables for macro caching grids
CREATE TABLE restaurant_cache_res7 (
    h3_cell_id VARCHAR(15) PRIMARY KEY,
    places_data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE restaurant_cache_res6 (
    h3_cell_id VARCHAR(15) PRIMARY KEY,
    places_data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for AI menu extraction
CREATE TABLE restaurant_menu_cache (
    place_id TEXT PRIMARY KEY,
    top_items TEXT[] NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE restaurant_cache_res7 ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_cache_res6 ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read access (if client fetches directly)
CREATE POLICY "Enable read access for all users" ON restaurant_cache_res7 FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON restaurant_cache_res6 FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON restaurant_menu_cache FOR SELECT USING (true);

-- Allow anon key to insert via Edge Functions
CREATE POLICY "Enable insert for all users" ON restaurant_cache_res7 FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable insert for all users" ON restaurant_cache_res6 FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable insert for all users" ON restaurant_menu_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON restaurant_cache_res7 FOR UPDATE USING (true);
CREATE POLICY "Enable update for all users" ON restaurant_cache_res6 FOR UPDATE USING (true);
CREATE POLICY "Enable update for all users" ON restaurant_menu_cache FOR UPDATE USING (true);
