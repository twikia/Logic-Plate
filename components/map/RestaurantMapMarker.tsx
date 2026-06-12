import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';

// BLEED: transparent padding on all sides so shadows/glows are never clipped
// by the native bitmap boundary, regardless of icon size (cap: 70px pill width).
const BLEED = 22;
const SP = 10;

const PILL_W = 64;
const PILL_H = 30;
const PILL_CORNER = 15;
const TIP_H = 8;
const TIP_SIDE = 6;

const SEL_PILL_W = 86;
const SEL_PILL_H = 40;
const SEL_PILL_CORNER = 20;
const SEL_TIP_H = 10;
const SEL_TIP_SIDE = 8;

// Inner layout (no bleed)
const INNER_W = SP * 2 + PILL_W;
const INNER_H = SP + PILL_H + TIP_H + SP;
const SEL_INNER_W = SP * 2 + SEL_PILL_W;
const SEL_INNER_H = SP + SEL_PILL_H + SEL_TIP_H + SP;

// Total view = inner + bleed on all four sides
const TOTAL_W = INNER_W + BLEED * 2;
const TOTAL_H = INNER_H + BLEED * 2;
const SEL_TOTAL_W = SEL_INNER_W + BLEED * 2;
const SEL_TOTAL_H = SEL_INNER_H + BLEED * 2;

// Pin the tip point to the map coordinate
const ANCHOR_X = 0.5;
const ANCHOR_Y = (BLEED + SP + PILL_H + TIP_H) / TOTAL_H;
const SEL_ANCHOR_Y = (BLEED + SP + SEL_PILL_H + SEL_TIP_H) / SEL_TOTAL_H;

type RestaurantMapMarkerProps = {
  item: any;
  markerColor: string;
  displayScore: string | number;
  isOpen: boolean;
  isSelected: boolean;
  onPress: () => void;
};

export function RestaurantMapMarker({
  item,
  markerColor,
  displayScore,
  isOpen,
  isSelected,
  onPress,
}: RestaurantMapMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    if (tracksViewChanges) {
      const t = setTimeout(() => setTracksViewChanges(false), 500);
      return () => clearTimeout(t);
    }
  }, [tracksViewChanges]);

  useEffect(() => {
    setTracksViewChanges(true);
  }, [isSelected]);

  const scoreText = typeof displayScore === 'number' ? displayScore.toFixed(1) : String(displayScore);
  const iconName = markerIconForPlace(item);

  const pillW = isSelected ? SEL_PILL_W : PILL_W;
  const pillH = isSelected ? SEL_PILL_H : PILL_H;
  const pillCorner = isSelected ? SEL_PILL_CORNER : PILL_CORNER;
  const tipH = isSelected ? SEL_TIP_H : TIP_H;
  const tipSide = isSelected ? SEL_TIP_SIDE : TIP_SIDE;
  const totalW = isSelected ? SEL_TOTAL_W : TOTAL_W;
  const totalH = isSelected ? SEL_TOTAL_H : TOTAL_H;
  const anchorY = isSelected ? SEL_ANCHOR_Y : ANCHOR_Y;
  const iconSize = isSelected ? 17 : 13;
  const fontSize = isSelected ? 14 : 11;

  // Aura ring positions (absolute, rendered before pill so they appear behind it)
  const pillTopInView = BLEED + SP; // where normal-flow pill starts
  const aura2W = pillW + 10;
  const aura2H = pillH + 10;
  const aura2Top = pillTopInView - 5;
  const aura2Left = (totalW - aura2W) / 2;

  const aura1W = pillW + 20;
  const aura1H = pillH + 20;
  const aura1Top = pillTopInView - 10;
  const aura1Left = (totalW - aura1W) / 2;

  const aura0W = pillW + 34;
  const aura0H = pillH + 34;
  const aura0Top = pillTopInView - 17;
  const aura0Left = (totalW - aura0W) / 2;

  const iconColor = isSelected ? markerColor : '#FFFFFF';

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      zIndex={isSelected ? 100 : 10}
      anchor={{ x: ANCHOR_X, y: anchorY }}
      tracksViewChanges={tracksViewChanges}
    >
      {/* Outer container: BLEED pads all sides so shadows are never clipped.
          Normal-flow children (pill + tip) establish the measured layout for Android. */}
      <View
        style={{
          width: totalW,
          height: totalH,
          alignItems: 'center',
          paddingTop: BLEED + SP,
          opacity: isOpen ? 1 : 0.5,
        }}
        collapsable={false}
      >
        {/* Aura rings — absolutely positioned BEFORE the pill so they render behind it */}
        {isSelected && (
          <View
            style={{
              position: 'absolute',
              top: aura0Top,
              left: aura0Left,
              width: aura0W,
              height: aura0H,
              borderRadius: pillCorner + 17,
              backgroundColor: markerColor + '18',
            }}
          />
        )}
        <View
          style={{
            position: 'absolute',
            top: aura1Top,
            left: aura1Left,
            width: aura1W,
            height: aura1H,
            borderRadius: pillCorner + 10,
            backgroundColor: isSelected ? markerColor + '28' : markerColor + '1A',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: aura2Top,
            left: aura2Left,
            width: aura2W,
            height: aura2H,
            borderRadius: pillCorner + 5,
            backgroundColor: isSelected ? markerColor + '38' : markerColor + '22',
            shadowColor: markerColor,
            shadowOpacity: isSelected ? 1.0 : 0.9,
            shadowRadius: isSelected ? 18 : 11,
            shadowOffset: { width: 0, height: 0 },
            elevation: isSelected ? 16 : 9,
          }}
        />

        {/* Pill — in normal flow so Android measures the marker correctly */}
        <View
          style={{
            width: pillW,
            height: pillH,
            borderRadius: pillCorner,
            backgroundColor: isSelected ? 'rgba(10,4,24,0.97)' : 'rgba(6,3,14,0.95)',
            borderWidth: isSelected ? 2 : 1.5,
            borderColor: markerColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            paddingHorizontal: 9,
            shadowColor: markerColor,
            shadowOpacity: isSelected ? 1.0 : 0.9,
            shadowRadius: isSelected ? 18 : 11,
            shadowOffset: { width: 0, height: 0 },
            elevation: isSelected ? 16 : 9,
          }}
        >
          <Ionicons
            name={iconName}
            size={iconSize}
            color={iconColor}
            style={{
              textShadowColor: markerColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: isSelected ? 10 : 6,
            }}
          />
          <Text
            style={{
              fontSize,
              fontWeight: '800',
              color: isSelected ? markerColor : '#FFFFFF',
              letterSpacing: -0.3,
              textShadowColor: markerColor,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: isSelected ? 10 : 7,
            }}
            numberOfLines={1}
          >
            {scoreText}
          </Text>
        </View>

        {/* Tip triangle — in normal flow, sits immediately below pill */}
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: tipSide,
            borderRightWidth: tipSide,
            borderTopWidth: tipH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: markerColor,
            marginTop: -1,
          }}
        />
      </View>
    </Marker>
  );
}
