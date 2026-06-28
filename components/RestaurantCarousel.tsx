import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '@/core/images';
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

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { width, height, zIndex: active ? 1 : 0 }, animStyle]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      <RestaurantImage
        restaurantId={restaurantId}
        photos={[photo]}
        width={typeof width === 'number' ? width : 400}
        height={height}
        borderRadius={0}
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
    </Animated.View>
  );
}

export function RestaurantCarousel({ place, width, height, borderRadius = 0, startIndex = 0, autoRotate = false, quality, containHorizontal, onImageDimensions }: Props) {
  const [photos, setPhotos] = useState<any[]>(place?.photos || []);
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  const name = place?.displayName?.text;
  const latitude = place?.location?.latitude;
  const longitude = place?.location?.longitude;
  const websiteUrl = place?.websiteUri;
  const formattedAddress = place?.formattedAddress;
  const cuisineKey = place?.primaryType?.replace(/_restaurant$/, '');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!place?.id || !place?.displayName?.text || !place?.location) return;
      try {
        const urls = await fetchRestaurantPhotoUrls({
          placeId: place.id,
          name: place.displayName.text,
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          websiteUrl: place.websiteUri || undefined,
          formattedAddress: place.formattedAddress || undefined,
          cuisineKey: place.primaryType?.replace(/_restaurant$/, '') || undefined,
        });
        if (!cancelled && urls.length > 0) {
          setPhotos(urls);
          if (urls.length > startIndex) setCurrentIndex(startIndex);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [place, startIndex]);

  const displayPhotos = photos.slice(0, 3);

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
          restaurantId={place?.id ?? 'unknown'}
          photos={[]}
          width={typeof width === 'number' ? width : 400}
          height={height}
          borderRadius={0}
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
            restaurantId={i === 0 ? (place?.id ?? 'unknown') : `${place?.id ?? 'unknown'}_${i}`}
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
    const photo = displayPhotos[0];
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        <RestaurantImage
          restaurantId={place?.id ?? 'unknown'}
          photos={[photo]}
          width={typeof width === 'number' ? width : 400}
          height={height}
          borderRadius={0}
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
            restaurantId={`${place?.id ?? 'unknown'}_${i}`}
            photos={[p]}
            width={typeof width === 'number' ? width : 400}
            height={height}
            borderRadius={0}
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
        </View>
      ))}
    </ScrollView>
  );
}
