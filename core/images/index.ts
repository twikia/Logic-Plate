/**
 * core/images — Centralized restaurant image loading system.
 *
 * Public API:
 *  - RestaurantImage  (component)  — drop-in image with spinner + fallback
 *  - clearImageCache  (function)   — wipe memory + disk cache
 */
export { RestaurantImage } from './RestaurantImage';
export { clearImageCache } from './imageCache';
