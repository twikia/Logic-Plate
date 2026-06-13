import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';

const SP = 10;
const CANVAS_PAD = 8;

const PILL_W = 70;
const PILL_H = 28;
const PILL_CORNER = 14;
const TIP_H = 8;
const TIP_SIDE = 6;

const SEL_PILL_W = 78;
const SEL_PILL_H = 34;
const SEL_PILL_CORNER = 17;
const SEL_TIP_H = 9;
const SEL_TIP_SIDE = 7;

const TOTAL_W = CANVAS_PAD * 2 + SP * 2 + PILL_W;
const TOTAL_H = CANVAS_PAD * 2 + SP + PILL_H + TIP_H + SP;
const SEL_TOTAL_W = CANVAS_PAD * 2 + SP * 2 + SEL_PILL_W;
const SEL_TOTAL_H = CANVAS_PAD * 2 + SP + SEL_PILL_H + SEL_TIP_H + SP;

const ANCHOR_X = 0.5;
const ANCHOR_Y = (CANVAS_PAD + SP + PILL_H + TIP_H) / TOTAL_H;
const SEL_ANCHOR_Y = (CANVAS_PAD + SP + SEL_PILL_H + SEL_TIP_H) / SEL_TOTAL_H;

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
      const t = setTimeout(() => setTracksViewChanges(false), 1000);
      return () => clearTimeout(t);
    }
  }, [tracksViewChanges]);

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
  const iconSize = isSelected ? 14 : 11;
  const fontSize = isSelected ? 12 : 10;

  useEffect(() => {
    setTracksViewChanges(true);
  }, [displayScore, iconName, isOpen, isSelected, markerColor]);

  const markerVisualColor = isOpen ? markerColor : '#8B8F98';
  const iconColor = '#FFFFFF';
  const scoreColor = isSelected ? '#FFFFFF' : '#F8FAFC';

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
          width: totalW,
          height: totalH,
          alignItems: 'center',
          paddingTop: CANVAS_PAD + SP,
          opacity: isOpen ? 1 : 0.92,
        }}
        collapsable={false}
      >
        <View
          style={{
            width: pillW,
            height: pillH,
            borderRadius: pillCorner,
            backgroundColor: isSelected ? '#13071F' : '#0B0614',
            borderWidth: isSelected ? 2 : 1.5,
            borderColor: markerVisualColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
            shadowColor: markerVisualColor,
            shadowOpacity: isSelected ? 0.95 : 0.5,
            shadowRadius: isSelected ? 8 : 5,
            shadowOffset: { width: 0, height: 2 },
            elevation: isSelected ? 9 : 5,
          }}
          collapsable={false}
        >
          <Ionicons
            name={iconName}
            size={iconSize}
            color={iconColor}
          />
          <Text
            style={{
              fontSize,
              fontWeight: '800',
              color: scoreColor,
              letterSpacing: -0.3,
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
            borderTopColor: markerVisualColor,
            marginTop: -1,
          }}
        />
      </View>
    </Marker>
  );
}
