import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { profileButtonTop, PROFILE_BUTTON_RIGHT } from './profileButtonLayout';
import { useProfileIcon } from '@/hooks/useProfileIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/ThemeContext';

const RING_SIZE = 58;
const GRAD_SPIN_SIZE = 120;

function NeonProfileRing({ icon, pressed, neonColors, cardBg }: { icon: string; pressed: boolean; neonColors: [string, string, string, string]; cardBg: string }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    rotate.value = withRepeat(
      withTiming(360, { duration: 5000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotate]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  const offset = (RING_SIZE - GRAD_SPIN_SIZE) / 2;

  return (
    <View
      style={[
        styles.neonRing,
        {
          opacity: pressed ? 0.75 : 1,
          shadowColor: neonColors[0],
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.85,
          shadowRadius: 12,
          elevation: 10,
        },
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: GRAD_SPIN_SIZE,
            height: GRAD_SPIN_SIZE,
            left: offset,
            top: offset,
          },
          spinStyle,
        ]}
      >
        <LinearGradient
          colors={neonColors}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <View style={[styles.neonInner, { backgroundColor: cardBg }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
    </View>
  );
}

export function TopProfileButton() {
  const { theme } = useAppTheme();
  const { icon } = useProfileIcon();
  const insets = useSafeAreaInsets();
  const neon = theme.neonColors;
  const d = theme.depth;

  return (
    <View style={[styles.container, { top: profileButtonTop(insets.top) }]}>
      <Link href={"/profile" as any} asChild>
        <AnimatedPressable>
          {({ pressed }) =>
            neon ? (
              <NeonProfileRing icon={icon} pressed={pressed} neonColors={neon} cardBg={theme.cardBackground} />
            ) : d ? (
              // Depth-aware convex button
              <View
                style={[
                  styles.button,
                  {
                    opacity: pressed ? 0.72 : 1,
                    // Dual 1px edge borders
                    borderTopColor: d.edgeHighlight,
                    borderLeftColor: d.edgeHighlight,
                    borderBottomColor: d.edgeShadow,
                    borderRightColor: d.edgeShadow,
                    // Drop shadow
                    shadowColor: d.shadowColor,
                    shadowOffset: { width: 1, height: 4 },
                    shadowOpacity: 0.5,
                    shadowRadius: 10,
                    elevation: 8,
                    overflow: 'hidden',
                  },
                ]}
              >
                <LinearGradient
                  colors={d.convexGradient}
                  start={{ x: 0.1, y: 0.1 }}
                  end={{ x: 0.9, y: 0.9 }}
                  style={[StyleSheet.absoluteFillObject, { borderRadius: 25 }]}
                />
                <Text style={styles.iconText}>{icon}</Text>
              </View>
            ) : (
              // Fallback plain button
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
    right: PROFILE_BUTTON_RIGHT,
    zIndex: 100,
  },
  button: {
    borderRadius: 27,
    // borderWidth split to per-side in dynamic style for depth theming
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  neonRing: {
    borderRadius: RING_SIZE / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    overflow: 'hidden',
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
