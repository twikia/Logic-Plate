-- Replace Mapillary tier with Wikimedia Commons in the photo cache schema.
alter table public.restaurant_photo_cache
  rename column mapillary_urls to wikimedia_urls;

comment on column public.restaurant_photo_cache.wikimedia_urls is
  'Tier 2: Wikimedia Commons images matched by restaurant name/details (CC-licensed, hotlinkable URLs)';
