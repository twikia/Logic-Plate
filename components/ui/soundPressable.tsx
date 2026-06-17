import React from 'react';
import {
  Pressable as RNPressable,
  TouchableOpacity as RNTouchableOpacity,
  View,
  type PressableProps,
  type TouchableOpacityProps,
} from 'react-native';
import { playTap } from '@/core/audioService';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const AnimatedRNPressable = Animated.createAnimatedComponent(RNPressable);
const AnimatedRNTouchable = Animated.createAnimatedComponent(RNTouchableOpacity);

const PRESS_DOWN_SCALE = 0.95;
const PRESS_DOWN_MS = 70;

type SoundPressProps = {
  silent?: boolean;
  animated?: boolean;
  throttleMs?: number;
};

let globalLastPressTime = 0;

export function registerGlobalPress(throttleMs: number): boolean {
  if (throttleMs === 0) return true;
  const now = Date.now();
  if (now - globalLastPressTime < throttleMs) {
    return false;
  }
  globalLastPressTime = now;
  return true;
}

export const Pressable = React.forwardRef<View, PressableProps & SoundPressProps>(
  ({ onPress, silent, animated = true, throttleMs = 500, onPressIn, onPressOut, style, ...props }, ref) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePress = React.useCallback(
      (...args: Parameters<Exclude<PressableProps['onPress'], null | undefined>>) => {
        if (!onPress) return;
        if (!registerGlobalPress(throttleMs)) {
          return;
        }
        if (!silent) playTap();
        onPress(...args);
      },
      [onPress, silent, throttleMs]
    );

    if (!animated) {
      return (
        <RNPressable
          {...props}
          ref={ref}
          style={style}
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        />
      );
    }

    return (
      <AnimatedRNPressable
        {...props}
        ref={ref}
        style={[style, animatedStyle]}
        onPress={handlePress}
        onPressIn={(e) => {
          scale.value = withTiming(PRESS_DOWN_SCALE, { duration: PRESS_DOWN_MS, easing: Easing.out(Easing.quad) });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1.0, { damping: 12, stiffness: 200 });
          onPressOut?.(e);
        }}
      />
    );
  }
);
Pressable.displayName = 'SoundPressable';

export const TouchableOpacity = React.forwardRef<View, TouchableOpacityProps & SoundPressProps>(
  ({ onPress, silent, animated = true, throttleMs = 500, onPressIn, onPressOut, style, ...props }, ref) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePress = React.useCallback(
      (...args: Parameters<Exclude<TouchableOpacityProps['onPress'], null | undefined>>) => {
        if (!onPress) return;
        if (!registerGlobalPress(throttleMs)) {
          return;
        }
        if (!silent) playTap();
        onPress(...args);
      },
      [onPress, silent, throttleMs]
    );

    if (!animated) {
      return (
        <RNTouchableOpacity
          {...props}
          ref={ref}
          style={style}
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        />
      );
    }

    return (
      <AnimatedRNTouchable
        {...props}
        ref={ref}
        style={[style, animatedStyle]}
        onPress={handlePress}
        onPressIn={(e) => {
          scale.value = withTiming(PRESS_DOWN_SCALE, { duration: PRESS_DOWN_MS, easing: Easing.out(Easing.quad) });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1.0, { damping: 12, stiffness: 200 });
          onPressOut?.(e);
        }}
      />
    );
  }
);
TouchableOpacity.displayName = 'SoundTouchableOpacity';
