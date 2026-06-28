/**
 * GradientShadow
 *
 * Renders a visible gradient "pool shadow" beneath a card that works on
 * both dark and light backgrounds. Native iOS `shadowColor` is invisible
 * on dark surfaces (no ambient light to scatter), so we paint a soft
 * linear gradient strip below elevated elements instead.
 *
 * Usage: place directly after the card element in the same parent View.
 * The strip is positioned absolutely and does NOT affect layout.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/context/ThemeContext';

interface GradientShadowProps {
  /** How wide the shadow blur extends beyond each horizontal edge. Default: 8 */
  spreadX?: number;
  /** How tall the shadow strip is. Default: 18 */
  height?: number;
  /** Vertical offset from the bottom of the containing element. Default: -6 */
  offsetY?: number;
  /** Border radius to match the card. Default: 20 */
  borderRadius?: number;
  /** Override the gradient colors instead of reading from theme.depth.shadowGradient */
  colors?: [string, string];
  /** Opacity multiplier 0..1. Default: 1 */
  opacity?: number;
}

export function GradientShadow({
  spreadX = 8,
  height = 18,
  offsetY = -6,
  borderRadius = 20,
  colors,
  opacity = 1,
}: GradientShadowProps) {
  const { theme } = useAppTheme();
  const gradColors: [string, string] =
    colors ?? theme.depth?.shadowGradient ?? ['rgba(0,0,0,0.18)', 'transparent'];

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { top: undefined, bottom: offsetY, left: -spreadX, right: -spreadX },
        opacity < 1 && { opacity },
      ]}
    >
      <LinearGradient
        colors={gradColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ height, borderBottomLeftRadius: borderRadius, borderBottomRightRadius: borderRadius }}
      />
    </View>
  );
}
