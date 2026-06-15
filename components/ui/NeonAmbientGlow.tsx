import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '@/context/ThemeContext';

/**
 * Renders a slow-breathing ambient glow behind screen content for neon themes.
 * Renders nothing for non-neon themes.
 */
export function NeonAmbientGlow() {
  const { theme } = useAppTheme();
  const pulse = useSharedValue(0);
  const pulse2 = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    pulse2.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [pulse, pulse2]);

  const glowStyle1 = useAnimatedStyle(() => ({
    opacity: 0.025 + pulse.value * 0.055,
  }));

  const glowStyle2 = useAnimatedStyle(() => ({
    opacity: 0.018 + pulse2.value * 0.038,
  }));

  if (!theme.neonColors) return null;

  const accent = theme.neonColors[0];
  const accent2 = theme.neonColors[2];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.glowTop,
          { backgroundColor: accent },
          glowStyle1,
        ]}
      />
      <Animated.View
        style={[
          styles.glowBottom,
          { backgroundColor: accent2 },
          glowStyle2,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glowTop: {
    position: 'absolute',
    top: -120,
    left: -80,
    right: -80,
    height: 320,
    borderRadius: 999,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -80,
    right: -80,
    height: 280,
    borderRadius: 999,
  },
});
