/**
 * core/images — Centralized restaurant image loading system.
 *
 * Public API:
 *  - RestaurantImage         (component) — drop-in image with spinner + fallback
 *  - fetchRestaurantPhotoUrls (function)  — three-tier URL list resolver
 *  - clearImageCache          (function)  — wipe memory + disk cache
 *  - clearRemotePhotoCache    (function)  — wipe the remote Supabase cache table
 */
export { RestaurantImage } from './RestaurantImage';
export { clearImageCache, clearRemotePhotoCache, fetchRestaurantPhotoUrls } from './imageCache';
