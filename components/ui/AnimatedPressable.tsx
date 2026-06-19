import React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';
import { playTap } from '@/core/audioService';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { registerGlobalPress } from './soundPressable';

const AnimatedPressableComponent = Animated.createAnimatedComponent(Pressable);

const DOWN_MS  = 30;   // snap press-in
const UP_MS    = 30;   // overshoot rise
const SETTLE_MS = 40;  // settle back to 1.0

type AnimatedPressableProps = PressableProps & {
  silent?: boolean;
  throttleMs?: number;
};

export const AnimatedPressable = React.forwardRef<View, AnimatedPressableProps>(
  ({ children, style, onPress, onPressIn, onPressOut, silent, throttleMs = 300, ...props }, ref) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressableComponent
        {...props}
        ref={ref}
        style={[style, animatedStyle]}
        onPress={(e) => {
          if (!registerGlobalPress(throttleMs)) {
            return;
          }
          if (!silent) playTap();
          onPress?.(e);
        }}
        onPressIn={(e) => {
          scale.value = withTiming(0.86, { duration: DOWN_MS, easing: Easing.out(Easing.quad) });
          if (onPressIn) onPressIn(e);
        }}
        onPressOut={(e) => {
          scale.value = withSequence(
            withTiming(1.04, { duration: UP_MS, easing: Easing.out(Easing.quad) }),
            withTiming(1.0, { duration: SETTLE_MS, easing: Easing.inOut(Easing.quad) })
          );
          if (onPressOut) onPressOut(e);
        }}
      >
        {children}
      </AnimatedPressableComponent>
    );
  }
);

AnimatedPressable.displayName = 'AnimatedPressable';
