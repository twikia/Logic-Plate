import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { markerIconForPlace } from '@/core/markerIcons';

const BUBBLE = 26;
const TIP_H = 6;
const PAD_LEFT = 4;
const PAD_RIGHT = 6;
const PAD_BOTTOM = 5;
const OUTER_W = PAD_LEFT + BUBBLE + PAD_RIGHT;
const OUTER_H = BUBBLE + TIP_H + PAD_BOTTOM;
const ANCHOR_X = (PAD_LEFT + BUBBLE / 2) / OUTER_W;
const ANCHOR_Y = (BUBBLE + TIP_H) / OUTER_H;

type RestaurantMapMarkerProps = {
  item: any;
  markerColor: string;
  displayScore: string | number;
  isOpen: boolean;
  onPress: () => void;
};

export function RestaurantMapMarker({
  item,
  markerColor,
  displayScore,
  isOpen,
  onPress,
}: RestaurantMapMarkerProps) {
  const scoreText = typeof displayScore === 'number' ? displayScore.toFixed(1) : String(displayScore);
  const iconName = markerIconForPlace(item);
  const compactScore = scoreText.length > 4;

  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      zIndex={10}
      anchor={{ x: ANCHOR_X, y: ANCHOR_Y }}
    >
      <View style={[styles.wrap, { opacity: isOpen ? 1 : 0.42 }]} collapsable={false}>
        <View style={styles.column}>
          <View style={[styles.bubble, { borderColor: markerColor }]}>
            <Ionicons name={iconName} size={17} color={markerColor} style={styles.iconWatermark} />
            <Text
              style={[styles.scoreText, compactScore && styles.scoreTextCompact]}
              numberOfLines={1}
            >
              {scoreText}
            </Text>
          </View>
          <View style={[styles.tip, { borderTopColor: markerColor }]} />
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: OUTER_W,
    height: OUTER_H,
    overflow: 'visible',
  },
  column: {
    position: 'absolute',
    left: PAD_LEFT,
    top: 0,
    width: BUBBLE,
    alignItems: 'center',
    overflow: 'visible',
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  iconWatermark: {
    position: 'absolute',
    opacity: 0.4,
  },
  scoreText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: -0.2,
    color: '#111827',
    textAlign: 'center',
    zIndex: 1,
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  scoreTextCompact: {
    fontSize: 7,
    letterSpacing: 0,
  },
  tip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: TIP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
