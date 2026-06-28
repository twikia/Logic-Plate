import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import { NeonAmbientGlow } from './NeonAmbientGlow';

type Props = {
  children: React.ReactNode;
};

/**
 * Wraps screen content with the correct themed background:
 * - Neon themes: pure black + animated ambient glow overlay
 * - Other themes with depth tokens: directional LinearGradient (top-left → bottom-right)
 *   to simulate a consistent top-left environmental light source
 * - Other themes without depth tokens: standard LinearGradient using theme.gradient
 */
export function ThemedScreenBackground({ children }: Props) {
  const { theme } = useAppTheme();
  const isNeon = Boolean(theme.neonColors);

  if (isNeon) {
    return (
      <View style={[styles.root, { backgroundColor: theme.gradient[0] ?? '#000000' }]}>
        <NeonAmbientGlow />
        {children}
      </View>
    );
  }

  // For themes with depth tokens, use a directional gradient (top-left → bottom-right)
  // to simulate a top-left light source across the entire screen background
  const gradientColors = theme.depth
    ? [theme.depth.convexGradient[0], theme.depth.convexGradient[1], theme.depth.convexGradient[2]]
    : theme.gradient;

  return (
    <LinearGradient
      colors={gradientColors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
