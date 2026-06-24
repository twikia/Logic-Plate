import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '@/core/images';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface Props {
  place: any;
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  startIndex?: number;
  autoRotate?: boolean;
}

export function RestaurantCarousel({ place, width, height, borderRadius = 0, startIndex = 0, autoRotate = false }: Props) {
  const [photos, setPhotos] = useState<any[]>(place?.photos || []);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  
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
        />
      </View>
    );
  }

  if (autoRotate || displayPhotos.length === 1) {
    const photo = displayPhotos[currentIndex] || displayPhotos[0];
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        <Animated.View key={currentIndex} entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)} style={{ width, height, position: 'absolute' }}>
          <RestaurantImage
            restaurantId={`${place?.id ?? 'unknown'}_${currentIndex}`}
            photos={[photo]}
            width={typeof width === 'number' ? width : 400}
            height={height}
            borderRadius={0}
          />
        </Animated.View>
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
          />
        </View>
      ))}
    </ScrollView>
  );
}
