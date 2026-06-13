import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';

const PAD = 12;

const PILL_H = 28;
const SEL_PILL_H = 34;
const TIP_H = 7;
const SEL_TIP_H = 8;
const TIP_SIDE = 6;
const SEL_TIP_SIDE = 7;
const GLOW = 4;
const SEL_GLOW = 6;

const ANCHOR_X = 0.5;
const TOTAL_H = PAD + PILL_H + TIP_H + PAD;
const SEL_TOTAL_H = PAD + SEL_PILL_H + SEL_TIP_H + PAD;
const ANCHOR_Y = (PAD + PILL_H + TIP_H) / TOTAL_H;
const SEL_ANCHOR_Y = (PAD + SEL_PILL_H + SEL_TIP_H) / SEL_TOTAL_H;

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
  const totalH = isSelected ? SEL_TOTAL_H : TOTAL_H;
  const anchorY = isSelected ? SEL_ANCHOR_Y : ANCHOR_Y;
  const iconSize = isSelected ? 15 : 12;
  const fontSize = isSelected ? 13 : 11;
  const pillRadius = pillH / 2;

  useEffect(() => {
    setTracksViewChanges(true);
  }, [scoreText, iconName, isOpen, isSelected, markerColor]);

  const accent = isOpen ? markerColor : '#8B8F98';
  const pillBg = isOpen ? '#120A1F' : '#1B1B22';

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      zIndex={isSelected ? 100 : 10}
      anchor={{ x: ANCHOR_X, y: anchorY }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        style={{
          height: totalH,
          paddingVertical: PAD,
          paddingHorizontal: PAD,
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
        collapsable={false}
      >
        <View style={{ alignItems: 'center' }} collapsable={false}>
          <View
            style={{
              height: pillH,
              borderRadius: pillRadius,
              backgroundColor: pillBg,
              borderWidth: isSelected ? 2.5 : 2,
              borderColor: accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 9,
              opacity: isOpen ? 1 : 0.95,
            }}
            collapsable={false}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -glow,
                left: -glow,
                right: -glow,
                bottom: -glow,
                borderRadius: pillRadius + glow,
                borderWidth: glow,
                borderColor: withAlpha(accent, isSelected ? 0.32 : 0.22),
              }}
            />
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

          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: tipSide,
              borderRightWidth: tipSide,
              borderTopWidth: tipH,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: accent,
              marginTop: -1,
            }}
          />
        </View>
      </View>
    </Marker>
  );
}
