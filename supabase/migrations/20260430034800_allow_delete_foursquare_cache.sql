-- Allow authenticated and anon users to delete from the cache for development/testing
-- In a real production app, you might want to restrict this more.
do $$ begin
  create policy "foursquare_photo_cache_delete"
  on public.foursquare_photo_cache
  for delete
  to authenticated, anon
  using (true);
exception when duplicate_object then null;
end $$;
