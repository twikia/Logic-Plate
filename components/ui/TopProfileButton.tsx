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

function NeonProfileRing({ icon, pressed, neonColors }: { icon: string; pressed: boolean; neonColors: [string, string, string, string] }) {
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
          shadowColor: '#00FFFF',
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
      <View style={styles.neonInner}>
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

  return (
    <View style={[styles.container, { top: profileButtonTop(insets.top) }]}>
      <Link href={"/profile" as any} asChild>
        <AnimatedPressable>
          {({ pressed }) =>
            neon ? (
              <NeonProfileRing icon={icon} pressed={pressed} neonColors={neon} />
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
    right: PROFILE_BUTTON_RIGHT,
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
