import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '@/core/images';

interface Props {
  place: any;
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
}

export function RestaurantCarousel({ place, width, height, borderRadius = 0 }: Props) {
  const [photos, setPhotos] = useState<any[]>(place?.photos || []);
  
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
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [place]);

  const displayPhotos = photos.slice(0, 3);

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

  // If there's only 1 photo, no need for ScrollView
  if (displayPhotos.length === 1) {
    return (
      <View style={{ width, height, borderRadius, overflow: 'hidden' }}>
        <RestaurantImage
          restaurantId={`${place?.id ?? 'unknown'}_0`}
          photos={[displayPhotos[0]]}
          width={typeof width === 'number' ? width : 400}
          height={height}
          borderRadius={0}
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
          />
        </View>
      ))}
    </ScrollView>
  );
}
