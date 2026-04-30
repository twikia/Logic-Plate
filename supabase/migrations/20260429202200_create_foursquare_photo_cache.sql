create table if not exists public.foursquare_photo_cache (
  google_place_id text primary key,
  fsq_id text null,
  photo_urls jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.foursquare_photo_cache enable row level security;

do $$ begin
  create policy "foursquare_photo_cache_read"
  on public.foursquare_photo_cache
  for select
  to authenticated, anon
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "foursquare_photo_cache_service_insert"
  on public.foursquare_photo_cache
  for insert
  to service_role
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "foursquare_photo_cache_service_update"
  on public.foursquare_photo_cache
  for update
  to service_role
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;
