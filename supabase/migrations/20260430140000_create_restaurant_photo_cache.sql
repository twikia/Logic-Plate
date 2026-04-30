-- Drop old foursquare-specific table and replace with a source-agnostic one.
-- We keep the old table around via rename so data isn't lost accidentally;
-- drop manually after confirming the new system works.

-- 1. Create the new unified photo cache table
create table if not exists public.restaurant_photo_cache (
  google_place_id text primary key,

  -- Tier 1: OG image scraped from the restaurant's own website
  og_urls        jsonb not null default '[]'::jsonb,

  -- Tier 2: Mapillary street-level exterior shots (CC BY-SA, permanent URLs)
  mapillary_urls jsonb not null default '[]'::jsonb,

  -- Tier 3: Unsplash cuisine-category photos (generic but beautiful, 100% coverage)
  unsplash_urls  jsonb not null default '[]'::jsonb,

  -- Combined ordered list cached here for fast reads (rebuilt by edge function)
  photo_urls     jsonb not null default '[]'::jsonb,

  -- Metadata
  cuisine_key    text null,
  updated_at     timestamptz not null default timezone('utc', now())
);

alter table public.restaurant_photo_cache enable row level security;

create policy "restaurant_photo_cache_read"
on public.restaurant_photo_cache
for select
to authenticated, anon
using (true);

create policy "restaurant_photo_cache_service_insert"
on public.restaurant_photo_cache
for insert
to service_role
with check (true);

create policy "restaurant_photo_cache_service_update"
on public.restaurant_photo_cache
for update
to service_role
using (true)
with check (true);

create policy "restaurant_photo_cache_service_delete"
on public.restaurant_photo_cache
for delete
to service_role
using (true);
