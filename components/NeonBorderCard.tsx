import React, { useEffect, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '@/context/ThemeContext';

interface NeonBorderCardProps {
  children: React.ReactNode;
  borderRadius?: number;
  outerStyle?: ViewStyle;
  innerStyle?: ViewStyle;
}

/**
 * Themed card wrapper.
 * - When theme.neonColors is defined: renders an animated rotating gradient border.
 * - Otherwise: renders a standard bordered card with shadow.
 *
 * Layout (flex, margins, padding) is never altered by this component —
 * those must be supplied via outerStyle / innerStyle.
 */
export function NeonBorderCard({
  children,
  borderRadius = 26,
  outerStyle,
  innerStyle,
}: NeonBorderCardProps) {
  const { theme } = useAppTheme();

  if (!theme.neonColors) {
    return (
      <View
        style={[
          styles.standardCard,
          {
            borderRadius,
            backgroundColor: theme.cardBackground,
            borderColor: theme.cardBorderColor,
            shadowColor: theme.cardShadowColor,
          },
          outerStyle,
        ]}
      >
        {children}
      </View>
    );
  }

  const spin = theme.neonBorderSpin !== false;

  if (!spin) {
    return (
      <NeonStaticBorder
        borderRadius={borderRadius}
        neonColors={theme.neonColors}
        cardBackground={theme.cardBackground}
        outerStyle={outerStyle}
        innerStyle={innerStyle}
      >
        {children}
      </NeonStaticBorder>
    );
  }

  return (
    <NeonAnimatedBorder
      borderRadius={borderRadius}
      neonColors={theme.neonColors}
      cardBackground={theme.cardBackground}
      outerStyle={outerStyle}
      innerStyle={innerStyle}
    >
      {children}
    </NeonAnimatedBorder>
  );
}

function NeonStaticBorder({
  children,
  borderRadius,
  neonColors,
  cardBackground,
  outerStyle,
  innerStyle,
}: {
  children: React.ReactNode;
  borderRadius: number;
  neonColors: [string, string, string, string];
  cardBackground: string;
  outerStyle?: ViewStyle;
  innerStyle?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          borderRadius,
          overflow: 'hidden',
          shadowColor: '#00FFFF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 14,
          elevation: 10,
        },
        outerStyle,
      ]}
    >
      <LinearGradient
        colors={neonColors}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        style={[
          {
            margin: 2,
            borderRadius: borderRadius - 2,
            backgroundColor: cardBackground,
            overflow: 'hidden',
          },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function NeonAnimatedBorder({
  children,
  borderRadius,
  neonColors,
  cardBackground,
  outerStyle,
  innerStyle,
}: {
  children: React.ReactNode;
  borderRadius: number;
  neonColors: [string, string, string, string];
  cardBackground: string;
  outerStyle?: ViewStyle;
  innerStyle?: ViewStyle;
}) {
  const rotate = useSharedValue(0);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    rotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotate]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setDims(prev =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  };

  const diag = Math.sqrt(dims.width * dims.width + dims.height * dims.height);
  const gradSize = diag > 0 ? diag + 4 : 400;
  const offsetX = (dims.width - gradSize) / 2;
  const offsetY = (dims.height - gradSize) / 2;

  return (
    <View
      style={[{ borderRadius, overflow: 'hidden' }, outerStyle]}
      onLayout={onLayout}
    >
      {dims.width > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: gradSize,
              height: gradSize,
              left: offsetX,
              top: offsetY,
            },
            animStyle,
          ]}
        >
          <LinearGradient
            colors={neonColors}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      )}
      <View
        style={[
          {
            margin: 2,
            borderRadius: borderRadius - 2,
            backgroundColor: cardBackground,
            overflow: 'hidden',
          },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  standardCard: {
    borderWidth: 1,
    overflow: 'visible',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12,
  },
});
