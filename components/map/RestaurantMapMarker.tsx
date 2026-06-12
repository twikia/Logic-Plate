import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';

const SP = 10;

const PILL_W = 58;
const PILL_H = 28;
const PILL_CORNER = 14;
const TIP_H = 7;
const TIP_SIDE = 5;

const SEL_PILL_W = 74;
const SEL_PILL_H = 36;
const SEL_PILL_CORNER = 18;
const SEL_TIP_H = 9;
const SEL_TIP_SIDE = 6;

const OUTER_W = SP * 2 + PILL_W;
const OUTER_H = SP + PILL_H + TIP_H + SP;
const SEL_OUTER_W = SP * 2 + SEL_PILL_W;
const SEL_OUTER_H = SP + SEL_PILL_H + SEL_TIP_H + SP;

const ANCHOR_X = 0.5;
const ANCHOR_Y = (SP + PILL_H + TIP_H) / OUTER_H;
const SEL_ANCHOR_Y = (SP + SEL_PILL_H + SEL_TIP_H) / SEL_OUTER_H;

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
  const outerW = isSelected ? SEL_OUTER_W : OUTER_W;
  const outerH = isSelected ? SEL_OUTER_H : OUTER_H;
  const anchorY = isSelected ? SEL_ANCHOR_Y : ANCHOR_Y;

  const pillBg = isSelected ? '#FFFFFF' : markerColor;
  const contentColor = isSelected ? markerColor : '#FFFFFF';
  const iconSize = isSelected ? 16 : 13;
  const fontSize = isSelected ? 13 : 11;

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
          width: outerW,
          height: outerH,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: SP,
          opacity: isOpen ? 1 : 0.55,
        }}
        collapsable={false}
      >
        <View
          style={{
            width: pillW,
            height: pillH,
            borderRadius: pillCorner,
            backgroundColor: pillBg,
            borderWidth: isSelected ? 2.5 : 0,
            borderColor: markerColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            paddingHorizontal: 9,
            shadowColor: '#000',
            shadowOpacity: isSelected ? 0.4 : 0.28,
            shadowRadius: isSelected ? 10 : 5,
            shadowOffset: { width: 0, height: isSelected ? 5 : 2 },
            elevation: isSelected ? 12 : 5,
          }}
        >
          <Ionicons name={iconName} size={iconSize} color={contentColor} />
          <Text
            style={{
              fontSize,
              fontWeight: '800',
              color: contentColor,
              letterSpacing: -0.3,
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
            borderTopColor: markerColor,
            marginTop: -1,
          }}
        />
      </View>
    </Marker>
  );
}
