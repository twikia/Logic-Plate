import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RestaurantImage, fetchRestaurantPhotoUrls, resolvePhotoUri } from '@/core/images';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface Props {
  place: any;
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  startIndex?: number;
  autoRotate?: boolean;
  quality?: number;
  containHorizontal?: boolean;
  onImageDimensions?: (w: number, h: number) => void;
}

function CarouselSlide({
  active,
  width,
  height,
  restaurantId,
  photo,
  quality,
  containHorizontal,
  onImageDimensions,
  name,
  latitude,
  longitude,
  websiteUrl,
  formattedAddress,
  cuisineKey,
}: {
  active: boolean;
  width: number | `${number}%`;
  height: number;
  restaurantId: string;
  photo: any;
  quality?: number;
  containHorizontal?: boolean;
  onImageDimensions?: (w: number, h: number) => void;
  name?: string;
  latitude?: number;
  longitude?: number;
  websiteUrl?: string;
  formattedAddress?: string;
  cuisineKey?: string;
}) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active ? 1 : 0, { duration: 400 }),
  }), [active]);

  const photoArray = useMemo(() => [photo], [photo]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { width, height, zIndex: active ? 1 : 0 }, animStyle]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      <RestaurantImage
        restaurantId={restaurantId}
        photos={photoArray}
        width={typeof width === 'number' ? width : 400}
        height={height}
        borderRadius={0}
        quality={quality}
        loadDelay={0}
        containHorizontal={containHorizontal}
        onImageDimensions={onImageDimensions}
        name={name}
        latitude={latitude}
        longitude={longitude}
        websiteUrl={websiteUrl}
        formattedAddress={formattedAddress}
        cuisineKey={cuisineKey}
      />
    </Animated.View>
  );
}

function photosEqual(prev: any[], next: string[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((photo, index) => {
    const prevUri = resolvePhotoUri(photo);
    const nextUri = next[index];
    return prevUri === nextUri || photo === nextUri;
  });
}

function RestaurantCarouselInner({ place, width, height, borderRadius = 0, startIndex = 0, autoRotate = false, quality, containHorizontal, onImageDimensions }: Props) {
  const [photos, setPhotos] = useState<any[]>(place?.photos || []);
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  const placeId = place?.id ?? '';
  const name = place?.displayName?.text;
  const latitude = place?.location?.latitude;
  const longitude = place?.location?.longitude;
  const websiteUrl = place?.websiteUri;
  const formattedAddress = place?.formattedAddress;
  const cuisineKey = place?.primaryType?.replace(/_restaurant$/, '');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!placeId || !name || typeof latitude !== 'number' || typeof longitude !== 'number') return;
      try {
        const urls = await fetchRestaurantPhotoUrls({
          placeId,
          name,
          latitude,
          longitude,
          websiteUrl: websiteUrl || undefined,
          formattedAddress: formattedAddress || undefined,
          cuisineKey: cuisineKey || undefined,
        });
        if (!cancelled && urls.length > 0) {
          setPhotos(prev => (photosEqual(prev, urls) ? prev : urls));
          if (urls.length > startIndex) setCurrentIndex(startIndex);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [placeId, name, latitude, longitude, websiteUrl, formattedAddress, cuisineKey, startIndex]);

  const displayPhotos = useMemo(() => photos.slice(0, 3), [photos]);

  useEffect(() => {
    if (!autoRotate || displayPhotos.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayPhotos.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRotate, displayPhotos.length]);

  if (displayPhotos.length === 0) {
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        <RestaurantImage
          restaurantId={placeId || 'unknown'}
          photos={[]}
          width={typeof width === 'number' ? width : 400}
          height={height}
          borderRadius={0}
          quality={quality}
          loadDelay={0}
          containHorizontal={containHorizontal}
          onImageDimensions={onImageDimensions}
          name={name}
          latitude={latitude}
          longitude={longitude}
          websiteUrl={websiteUrl}
          formattedAddress={formattedAddress}
          cuisineKey={cuisineKey}
        />
      </View>
    );
  }

  if (autoRotate && displayPhotos.length > 1) {
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        {displayPhotos.map((photo, i) => (
          <CarouselSlide
            key={i}
            active={currentIndex === i}
            width={width}
            height={height}
            restaurantId={i === 0 ? (placeId || 'unknown') : `${placeId || 'unknown'}_${i}`}
            photo={photo}
            quality={quality}
            containHorizontal={containHorizontal}
            onImageDimensions={onImageDimensions}
            name={name}
            latitude={latitude}
            longitude={longitude}
            websiteUrl={websiteUrl}
            formattedAddress={formattedAddress}
            cuisineKey={cuisineKey}
          />
        ))}
      </View>
    );
  }

  if (displayPhotos.length === 1) {
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        <RestaurantImage
          restaurantId={placeId || 'unknown'}
          photos={displayPhotos}
          width={typeof width === 'number' ? width : 400}
          height={height}
          borderRadius={0}
          quality={quality}
          loadDelay={0}
          containHorizontal={containHorizontal}
          onImageDimensions={onImageDimensions}
          name={name}
          latitude={latitude}
          longitude={longitude}
          websiteUrl={websiteUrl}
          formattedAddress={formattedAddress}
          cuisineKey={cuisineKey}
        />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ width, height, borderRadius, overflow: 'hidden' }}
    >
      {displayPhotos.map((p, i) => (
        <View key={i} style={{ width, height }}>
          <RestaurantImage
            restaurantId={`${placeId || 'unknown'}_${i}`}
            photos={displayPhotos.slice(i, i + 1)}
            width={typeof width === 'number' ? width : 400}
            height={height}
            borderRadius={0}
            quality={quality}
            loadDelay={0}
            containHorizontal={containHorizontal}
            onImageDimensions={onImageDimensions}
            name={name}
            latitude={latitude}
            longitude={longitude}
            websiteUrl={websiteUrl}
            formattedAddress={formattedAddress}
            cuisineKey={cuisineKey}
          />
        </View>
      ))}
    </ScrollView>
  );
}

export const RestaurantCarousel = React.memo(RestaurantCarouselInner);
