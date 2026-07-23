import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';
import { playTap } from '@/core/audioService';
import type { HoursStatus } from '@/core/isOpenNow';

const RADIUS = 14;
const GLOW = 4;
const CLIP_PAD = 6;
// ▼ is a font glyph — rendered by TextPaint directly onto the software canvas,
// so it always appears in the react-native-maps bitmap capture on Android.
// Transforms (rotate) and SVG both use hardware layers that the software-canvas
// capture silently skips, which is why those approaches produced no pointer.
const TIP_FONT_SIZE = 13;
const TIP_OVERLAP = 1; // px the ▼ slides under the disc edge to avoid gaps

const MARKER_BG = '#120A1F';
const ACCENT_SELECTED = '#00FFFF';
const BORDER_W = 2;

const GLOW_DIAM = (RADIUS + GLOW) * 2;  // 36
const DISC_DIAM = RADIUS * 2;           // 28
const TOTAL_W = GLOW_DIAM + CLIP_PAD * 2; // 48
const DISC_TOP = CLIP_PAD + GLOW;        // 10
const DISC_BOTTOM = DISC_TOP + DISC_DIAM; // 38
const TIP_TOP = DISC_BOTTOM - TIP_OVERLAP; // 37
const TOTAL_H = TIP_TOP + TIP_FONT_SIZE + 2; // 52  (2 dp safety at bottom)

type RestaurantMapMarkerProps = {
  item: any;
  markerColor: string;
  displayScore: string | number;
  hoursStatus: HoursStatus;
  isSelected: boolean;
  onPress: () => void;
};

export function RestaurantMapMarker({
  item,
  markerColor,
  hoursStatus,
  isSelected,
  onPress,
}: RestaurantMapMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const iconName = markerIconForPlace(item);

  useEffect(() => {
    if (tracksViewChanges) {
      const t = setTimeout(() => setTracksViewChanges(false), 1200);
      return () => clearTimeout(t);
    }
  }, [tracksViewChanges]);

  useEffect(() => {
    setTracksViewChanges(true);
  }, [iconName, hoursStatus, isSelected, markerColor]);

  const accent = isSelected ? ACCENT_SELECTED : markerColor;
  const glowColor = accent + (isSelected ? '66' : '40');
  const markerOpacity =
    hoursStatus === 'open' ? 1 : hoursStatus === 'unknown' ? 0.7 : 0.4;

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={() => {
        playTap();
        onPress();
      }}
      zIndex={isSelected ? 100 : 10}
      anchor={{ x: 0.5, y: 1.0 }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        style={{ width: TOTAL_W, height: TOTAL_H, opacity: markerOpacity }}
        collapsable={false}
      >
        <View
          style={{
            position: 'absolute',
            left: CLIP_PAD,
            top: CLIP_PAD,
            width: GLOW_DIAM,
            height: GLOW_DIAM,
            borderRadius: RADIUS + GLOW,
            backgroundColor: glowColor,
          }}
        />

        <Text
          allowFontScaling={false}
          style={{
            position: 'absolute',
            left: 0,
            top: TIP_TOP,
            width: TOTAL_W,
            textAlign: 'center',
            color: accent,
            fontSize: TIP_FONT_SIZE,
            lineHeight: TIP_FONT_SIZE,
            includeFontPadding: false,
          }}
        >
          {'▼'}
        </Text>

        <View
          style={{
            position: 'absolute',
            left: CLIP_PAD + GLOW,
            top: DISC_TOP,
            width: DISC_DIAM,
            height: DISC_DIAM,
            borderRadius: RADIUS,
            backgroundColor: MARKER_BG,
            borderWidth: BORDER_W,
            borderColor: accent,
          }}
        />

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: CLIP_PAD + GLOW,
            top: DISC_TOP,
            width: DISC_DIAM,
            height: DISC_DIAM,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={iconName} size={13} color={markerColor} />
        </View>
      </View>
    </Marker>
  );
}
