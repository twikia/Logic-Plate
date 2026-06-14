import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';
import Svg, { Circle, Polygon } from 'react-native-svg';

const RADIUS = 14;
const GLOW = 4;
const TIP_H = 8;
const TIP_SIDE = 5;
const BOTTOM_PAD = 2;

const MARKER_BG = '#120A1F';
const ACCENT_SELECTED = '#00FFFF';
const BORDER_W = 2;

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
  isOpen,
  isSelected,
  onPress,
}: RestaurantMapMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const iconName = markerIconForPlace(item);

  useEffect(() => {
    if (tracksViewChanges) {
      const t = setTimeout(() => setTracksViewChanges(false), 800);
      return () => clearTimeout(t);
    }
  }, [tracksViewChanges]);

  useEffect(() => {
    setTracksViewChanges(true);
  }, [iconName, isOpen, isSelected, markerColor]);

  const accent = isSelected ? ACCENT_SELECTED : markerColor;
  const glowColor = accent + (isSelected ? '66' : '40');
  const markerOpacity = isOpen ? 1 : 0.4;

  const svgW = (RADIUS + GLOW) * 2;
  const tipApexY = GLOW + RADIUS * 2 + TIP_H;
  const svgH = tipApexY + BOTTOM_PAD;
  const cx = svgW / 2;
  const cy = GLOW + RADIUS;
  const tipTopY = GLOW + RADIUS * 2;
  const tipPoints = `${cx - TIP_SIDE},${tipTopY} ${cx + TIP_SIDE},${tipTopY} ${cx},${tipApexY}`;
  // Anchor at the true tip apex, not the canvas bottom
  const anchorY = tipApexY / svgH;

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      zIndex={isSelected ? 100 : 10}
      anchor={{ x: 0.5, y: anchorY }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        style={{ width: svgW, height: svgH, opacity: markerOpacity }}
        collapsable={false}
      >
        <Svg width={svgW} height={svgH}>
          {/* Glow ring */}
          <Circle cx={cx} cy={cy} r={RADIUS + GLOW} fill={glowColor} />
          {/* Main disc */}
          <Circle cx={cx} cy={cy} r={RADIUS} fill={MARKER_BG} stroke={accent} strokeWidth={BORDER_W} />
          {/* Pointer tip */}
          <Polygon points={tipPoints} fill={accent} />
        </Svg>

        {/* Icon — centered in disc, color matches the score gradient */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - RADIUS,
            top: GLOW,
            width: RADIUS * 2,
            height: RADIUS * 2,
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
