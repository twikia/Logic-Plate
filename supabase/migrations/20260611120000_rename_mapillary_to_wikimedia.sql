-- Replace Mapillary tier with Wikimedia Commons in the photo cache schema.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurant_photo_cache'
      and column_name = 'mapillary_urls'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurant_photo_cache'
      and column_name = 'wikimedia_urls'
  ) then
    alter table public.restaurant_photo_cache
      rename column mapillary_urls to wikimedia_urls;
  end if;
end $$;

comment on column public.restaurant_photo_cache.wikimedia_urls is
  'Tier 2: Wikimedia Commons images matched by restaurant name/details (CC-licensed, hotlinkable URLs)';
