/**
 * Depth3DCard
 *
 * A drop-in surface wrapper that applies 3D depth effects using the current
 * theme's `depth` token set. Assumes a top-left light source.
 *
 * - 'convex' (default): surface appears to pop out — lighter top-left,
 *   darker bottom-right, with a gradient pool shadow below.
 * - 'concave': surface appears pressed in — darker top-left,
 *   lighter bottom-right, inner shadow simulation.
 * - 'flat': plain card with only shadow depth (no gradient).
 *
 * LAYOUT CONTRACT: This component never touches flex, margin, padding,
 * or dimension values. All spatial layout must be supplied via `style`.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/context/ThemeContext';
import { GradientShadow } from './GradientShadow';

type Variant = 'convex' | 'concave' | 'flat';

interface Depth3DCardProps {
  children: React.ReactNode;
  variant?: Variant;
  borderRadius?: number;
  style?: ViewStyle;
  /** Inner content style — useful for padding overrides */
  innerStyle?: ViewStyle;
  /** Elevation multiplier. 1 = normal, 2 = more prominent. Default: 1 */
  elevationScale?: number;
}

export function Depth3DCard({
  children,
  variant = 'convex',
  borderRadius = 20,
  style,
  innerStyle,
  elevationScale = 1,
}: Depth3DCardProps) {
  const { theme } = useAppTheme();
  const d = theme.depth;

  // Fallback to a plain themed card when depth tokens are not defined
  if (!d) {
    return (
      <View
        style={[
          {
            borderRadius,
            backgroundColor: theme.cardBackground,
            borderWidth: 1.5,
            borderColor: theme.cardBorderColor,
            shadowColor: theme.cardShadowColor,
            shadowOffset: { width: 2, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
            elevation: Math.round(8 * elevationScale),
          },
          style,
        ]}
      >
        <View style={[{ borderRadius }, innerStyle]}>{children}</View>
      </View>
    );
  }

  const gradientColors =
    variant === 'concave' ? d.concaveGradient : d.convexGradient;

  // Convex surfaces cast a visible gradient shadow; concave are recessed (no shadow)
  const showShadow = variant !== 'concave';
  const shadowHeight = Math.round(20 * elevationScale);
  const shadowSpread = Math.round(10 * elevationScale);

  return (
    // Outer: positions the 1.5px highlight/shadow border frame
    <View
      style={[
        {
          borderRadius,
          // Top+Left edge highlight (light source) — slightly thicker for tactile feel
          borderTopWidth: 1.5,
          borderLeftWidth: 1.5,
          borderTopColor: d.edgeHighlight,
          borderLeftColor: d.edgeHighlight,
          // Bottom+Right edge shadow
          borderBottomWidth: 1.5,
          borderRightWidth: 1.5,
          borderBottomColor: d.edgeShadow,
          borderRightColor: d.edgeShadow,
          // Native shadow (visible on iOS light themes; gradient shadow handles dark)
          shadowColor: d.shadowColor,
          shadowOffset: { width: 1, height: variant === 'concave' ? 1 : 6 },
          shadowOpacity: variant === 'concave' ? 0.12 : 0.30,
          shadowRadius: variant === 'concave' ? 4 : 14,
          elevation: variant === 'concave'
            ? Math.round(2 * elevationScale)
            : Math.round(10 * elevationScale),
          overflow: 'visible',
        },
        style,
      ]}
    >
      {/* Gradient fill — clipped to borderRadius */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: borderRadius - 1.5 },
        ]}
      />
      {/* Content layer */}
      <View style={[{ borderRadius: borderRadius - 1.5, overflow: 'hidden' }, innerStyle]}>
        {children}
      </View>
      {/* Gradient pool shadow — visible on dark backgrounds */}
      {showShadow && (
        <GradientShadow
          height={shadowHeight}
          spreadX={shadowSpread}
          offsetY={-shadowHeight * 0.4}
          borderRadius={borderRadius}
        />
      )}
    </View>
  );
}
