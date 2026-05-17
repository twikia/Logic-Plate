import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from './AnimatedPressable';
import { useProfileIcon } from '@/hooks/useProfileIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/ThemeContext';

export function TopProfileButton() {
  const { theme } = useAppTheme();
  const { icon } = useProfileIcon();
  const insets = useSafeAreaInsets();
  const neon = theme.neonColors;

  return (
    <View style={[styles.container, { top: Math.max(insets.top, 20) + 12 }]}>
      <Link href={"/profile" as any} asChild>
        <AnimatedPressable>
          {({ pressed }) =>
            neon ? (
              <LinearGradient
                colors={neon}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.neonRing,
                  {
                    opacity: pressed ? 0.75 : 1,
                    shadowColor: '#00FFFF',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.85,
                    shadowRadius: 12,
                    elevation: 10,
                  },
                ]}
              >
                <View style={styles.neonInner}>
                  <Text style={styles.iconText}>{icon}</Text>
                </View>
              </LinearGradient>
            ) : (
              <View style={[styles.button, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.iconText}>{icon}</Text>
              </View>
            )
          }
        </AnimatedPressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  button: {
    borderRadius: 27,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  neonRing: {
    borderRadius: 29,
    padding: 2.5,
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  neonInner: {
    borderRadius: 26,
    width: 53,
    height: 53,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 30,
  },
});
