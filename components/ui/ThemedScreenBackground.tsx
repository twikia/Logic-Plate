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
 * - Other themes: LinearGradient using theme.gradient
 */
export function ThemedScreenBackground({ children }: Props) {
  const { theme } = useAppTheme();
  const isNeon = Boolean(theme.neonColors);

  if (isNeon) {
    return (
      <View style={[styles.root, { backgroundColor: '#000000' }]}>
        <NeonAmbientGlow />
        {children}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={theme.gradient}
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
