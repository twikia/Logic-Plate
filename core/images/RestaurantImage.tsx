import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import {
  adjustQuality,
  buildCandidateUrls,
  cacheImageUrl,
  getCachedImageUrl,
  invalidateCachedImageUrl,
} from './imageCache';

/**
 * RestaurantImage — Self-contained image component for restaurant photos.
 *
 * Features:
 *  - Completely decoupled from card layout; mounts/loads on its own schedule
 *  - Shows a spinner while loading; each instance resolves independently
 *  - Cycles through candidate URLs on failure
 *  - Caches the first successful URL so subsequent renders skip the waterfall
 *  - Falls back to a default icon if every URL fails
 *  - Logs every failure for debugging
 *  - Accepts a loadDelay prop so cards render instantly, images follow
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  /** Unique restaurant ID — used as cache key */
  restaurantId: string;
  /** Raw photos array straight from the Places API response */
  photos: any[];
  /** Width of the image container */
  width: number;
  /** Height of the image container */
  height: number;
  /** Optional quality override (maxWidthPx). Defaults to width value */
  quality?: number;
  /** Optional delay (ms) before image starts loading. Keeps cards snappy. */
  loadDelay?: number;
  /** Border radius */
  borderRadius?: number;
}

type LoadState = 'waiting' | 'loading' | 'loaded' | 'failed';

// ─── Component ──────────────────────────────────────────────────────────────

function RestaurantImageInner({
  restaurantId,
  photos,
  width,
  height,
  quality,
  loadDelay = 150,
  borderRadius = 0,
}: Props) {
  const [state, setState] = useState<LoadState>('waiting');
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const candidatesRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Build candidate list + check cache
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const init = async () => {
      const urls = buildCandidateUrls(photos);
      const cached = await getCachedImageUrl(restaurantId);

      if (urls.length === 0 && !cached) {
        if (mountedRef.current) {
          setActiveUri(null);
          setState('waiting');
        }
        return;
      }

      candidatesRef.current = cached
        ? [cached, ...urls.filter((url) => url !== cached)]
        : urls;
      indexRef.current = 0;

      timer = setTimeout(() => {
        if (!mountedRef.current) return;
        const maxPx = quality ?? width;
        const uri = adjustQuality(candidatesRef.current[0], maxPx);
        setActiveUri(uri);
        setState('loading');
      }, loadDelay);
    };

    init();
    return () => clearTimeout(timer);
  }, [restaurantId, photos, width, quality, loadDelay]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const onLoad = useCallback(() => {
    if (!mountedRef.current || !activeUri) return;
    setState('loaded');
    // Cache the working URL
    cacheImageUrl(restaurantId, activeUri).catch(err =>
      console.error(`[RestaurantImage] Cache write error for ${restaurantId}:`, err)
    );
  }, [activeUri, restaurantId]);

  const onError = useCallback(() => {
    if (!mountedRef.current) return;

    if (indexRef.current === 0) {
      invalidateCachedImageUrl(restaurantId).catch(() => {});
    }

    const nextIdx = indexRef.current + 1;
    if (nextIdx < candidatesRef.current.length) {
      indexRef.current = nextIdx;
      const maxPx = quality ?? width;
      const nextUri = adjustQuality(candidatesRef.current[nextIdx], maxPx);
      setActiveUri(nextUri);
    } else {
      console.warn(
        `[RestaurantImage] All ${candidatesRef.current.length} URLs exhausted for "${restaurantId}" — showing default`
      );
      setState('failed');
    }
  }, [restaurantId, quality, width]);

  // ── Render ──────────────────────────────────────────────────────────────

  const containerStyle = { width, height, borderRadius, overflow: 'hidden' as const };

  // Waiting / Loading — show spinner
  if (state === 'waiting' || (state === 'loading' && !activeUri)) {
    return (
      <View style={[styles.placeholder, containerStyle]}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
      </View>
    );
  }

  // All URLs failed — show default icon
  if (state === 'failed') {
    return (
      <View style={[styles.placeholder, containerStyle]}>
        <Ionicons name="restaurant-outline" size={Math.min(width, height) * 0.35} color="rgba(255,255,255,0.2)" />
      </View>
    );
  }

  // Loading or Loaded — render image
  return (
    <View style={containerStyle}>
      {/* Spinner behind the image while loading */}
      {state === 'loading' && (
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      )}
      <Image
        source={{ uri: activeUri! }}
        style={{ width, height }}
        contentFit="cover"
        transition={250}
        onLoad={onLoad}
        onError={onError}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

// Memoize to avoid re-renders when parent list re-renders
export const RestaurantImage = React.memo(RestaurantImageInner);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
