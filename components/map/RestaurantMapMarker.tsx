import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';
import Svg, { Rect, Polygon } from 'react-native-svg';

const PILL_W = 80;
const PILL_H = 28;
const SEL_PILL_H = 34;
const TIP_H = 7;
const SEL_TIP_H = 8;
const TIP_SIDE = 6;
const SEL_TIP_SIDE = 7;
const GLOW = 4;
const SEL_GLOW = 6;

function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  const h = a.toString(16).padStart(2, '0');
  return `${hex}${h}`;
}

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
      const t = setTimeout(() => setTracksViewChanges(false), 800);
      return () => clearTimeout(t);
    }
  }, [tracksViewChanges]);

  const scoreText = typeof displayScore === 'number' ? displayScore.toFixed(1) : String(displayScore);
  const iconName = markerIconForPlace(item);

  const pillH = isSelected ? SEL_PILL_H : PILL_H;
  const tipH = isSelected ? SEL_TIP_H : TIP_H;
  const tipSide = isSelected ? SEL_TIP_SIDE : TIP_SIDE;
  const glow = isSelected ? SEL_GLOW : GLOW;
  const iconSize = isSelected ? 15 : 12;
  const fontSize = isSelected ? 13 : 11;
  const pillRadius = pillH / 2;
  const borderWidth = isSelected ? 2.5 : 2;
  const markerOpacity = isOpen ? 1 : 0.4;

  useEffect(() => {
    setTracksViewChanges(true);
  }, [scoreText, iconName, isOpen, isSelected, markerColor]);

  const accent = markerColor;
  const pillBg = '#120A1F';
  const glowColor = withAlpha(accent, isSelected ? 0.32 : 0.22);

  // SVG canvas sized to fit glow + pill + tip with no overflow needed
  const svgW = PILL_W + glow * 2;
  const svgH = glow + pillH + tipH;

  // Pill starts at (glow, glow) inside the canvas
  const pillX = glow;
  const pillY = glow;

  // Tip triangle: base at bottom of pill, apex at bottom of canvas
  const tipCX = svgW / 2;
  const tipTopY = glow + pillH;
  const tipPoints = `${tipCX - tipSide},${tipTopY} ${tipCX + tipSide},${tipTopY} ${tipCX},${svgH}`;

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      zIndex={isSelected ? 100 : 10}
      anchor={{ x: 0.5, y: 1.0 }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        style={{ width: svgW, height: svgH, opacity: markerOpacity }}
        collapsable={false}
      >
        <Svg width={svgW} height={svgH}>
          {/* Glow: rounded rect extending glow px around the pill */}
          <Rect
            x={0}
            y={0}
            width={svgW}
            height={glow * 2 + pillH}
            rx={pillRadius + glow}
            ry={pillRadius + glow}
            fill={glowColor}
          />
          {/* Pill: filled background with accent border */}
          <Rect
            x={pillX}
            y={pillY}
            width={PILL_W}
            height={pillH}
            rx={pillRadius}
            ry={pillRadius}
            fill={pillBg}
            stroke={accent}
            strokeWidth={borderWidth}
          />
          {/* Tip triangle */}
          <Polygon points={tipPoints} fill={accent} />
        </Svg>

        {/* Icon and text: absolutely positioned within pill bounds — no overflow */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: pillX,
            top: pillY,
            width: PILL_W,
            height: pillH,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 9,
          }}
        >
          <Ionicons name={iconName} size={iconSize} color="#FFFFFF" />
          <Text
            style={{
              fontSize,
              fontWeight: '800',
              color: '#FFFFFF',
              letterSpacing: -0.2,
              marginLeft: 4,
            }}
            numberOfLines={1}
          >
            {scoreText}
          </Text>
        </View>
      </View>
    </Marker>
  );
}
