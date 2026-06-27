import { useAppTheme } from '@/context/ThemeContext';
import type { ThemeColors } from '@/themes/types';
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
  fetchRestaurantPhotoUrls,
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
  /** When photos are empty, fetch from the photo pipeline using place metadata */
  name?: string;
  latitude?: number;
  longitude?: number;
  websiteUrl?: string;
  formattedAddress?: string;
  cuisineKey?: string;
  photoUrl?: string;
}

type LoadState = 'waiting' | 'loading' | 'loaded' | 'failed';

function ImageFrame({
  width,
  height,
  borderRadius,
  theme,
  children,
}: {
  width: number;
  height: number;
  borderRadius: number;
  theme: ThemeColors;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius,
        overflow: 'hidden',
        backgroundColor: theme.imageBackdrop,
      }}>
      {children}
    </View>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function RestaurantImageInner({
  restaurantId,
  photos,
  width,
  height,
  quality,
  loadDelay = 150,
  borderRadius = 0,
  name,
  latitude,
  longitude,
  websiteUrl,
  formattedAddress,
  cuisineKey,
  photoUrl,
}: Props) {
  const { theme } = useAppTheme();
  const frameIconColor = theme.neonColors ? '#042F2E' : theme.subtext;
  const [state, setState] = useState<LoadState>('waiting');
  const [activeUri, setActiveUri] = useState<string | null>(null);
  const [resolvedPhotos, setResolvedPhotos] = useState<any[]>(photos);
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const candidatesRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      const direct = buildCandidateUrls(photos);
      if (direct.length > 0) {
        if (!cancelled) setResolvedPhotos(photos);
        return;
      }
      if (photoUrl) {
        if (!cancelled) setResolvedPhotos([photoUrl]);
        return;
      }
      if (
        !restaurantId ||
        !name ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number'
      ) {
        if (!cancelled) setResolvedPhotos(photos);
        return;
      }

      try {
        const urls = await fetchRestaurantPhotoUrls({
          placeId: restaurantId,
          name,
          latitude,
          longitude,
          websiteUrl,
          formattedAddress,
          cuisineKey,
        });
        if (cancelled) return;
        setResolvedPhotos(urls.length > 0 ? urls : photos);
      } catch {
        if (!cancelled) setResolvedPhotos(photos);
      }
    };

    void loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [
    cuisineKey,
    formattedAddress,
    latitude,
    longitude,
    name,
    photoUrl,
    photos,
    restaurantId,
    websiteUrl,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const init = async () => {
      const seedPhotos = photoUrl && buildCandidateUrls(resolvedPhotos).length === 0
        ? [photoUrl, ...resolvedPhotos]
        : resolvedPhotos;
      const urls = buildCandidateUrls(seedPhotos);
      const cached = await getCachedImageUrl(restaurantId);

      if (urls.length === 0 && !cached) {
        if (mountedRef.current) {
          setActiveUri(null);
          setState('failed');
        }
        return;
      }

      candidatesRef.current = cached
        ? [cached, ...urls.filter((url) => url !== cached)]
        : urls;
      indexRef.current = 0;

      const maxPx = width <= 100 ? Math.min(quality ?? width, 250) : (quality ?? width);

      if (cached) {
        if (mountedRef.current) {
          setActiveUri(adjustQuality(cached, maxPx));
          setState('loading');
        }
        return;
      }

      timer = setTimeout(() => {
        if (!mountedRef.current) return;
        const uri = adjustQuality(candidatesRef.current[0], maxPx);
        setActiveUri(uri);
        setState('loading');
      }, loadDelay);
    };

    init();
    return () => clearTimeout(timer);
  }, [loadDelay, photoUrl, quality, resolvedPhotos, restaurantId, width]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const onLoad = useCallback((e?: any) => {
    if (!mountedRef.current || !activeUri) return;
    if (e?.source?.width && e?.source?.height && e.source.width > e.source.height) {
      setImageFit('contain');
    }
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
      const maxPx = width <= 100 ? Math.min(quality ?? width, 250) : (quality ?? width);
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

  const frameProps = { width, height, borderRadius, theme };

  // Waiting / Loading — show spinner
  if (state === 'waiting' || (state === 'loading' && !activeUri)) {
    return (
      <ImageFrame {...frameProps}>
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      </ImageFrame>
    );
  }

  // All URLs failed — show default icon
  if (state === 'failed') {
    return (
      <ImageFrame {...frameProps}>
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          <Ionicons
            name="restaurant-outline"
            size={Math.min(width, height) * 0.35}
            color={frameIconColor}
          />
        </View>
      </ImageFrame>
    );
  }

  // Loading or Loaded — render image
  return (
    <ImageFrame {...frameProps}>
      {state === 'loading' && (
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      )}
      <Image
        source={{ uri: activeUri! }}
        style={{ width, height }}
        contentFit={imageFit}
        transition={250}
        onLoad={onLoad}
        onError={onError}
        cachePolicy="memory-disk"
      />
    </ImageFrame>
  );
}

// Memoize to avoid re-renders when parent list re-renders
export const RestaurantImage = React.memo(RestaurantImageInner);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
