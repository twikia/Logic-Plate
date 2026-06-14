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

const AnimatedPressableComponent = Animated.createAnimatedComponent(Pressable);

const DOWN_MS  = 60;   // snap press-in
const UP_MS    = 55;   // overshoot rise
const SETTLE_MS = 70;  // settle back to 1.0

type AnimatedPressableProps = PressableProps & {
  silent?: boolean;
};

export const AnimatedPressable = React.forwardRef<View, AnimatedPressableProps>(
  ({ children, style, onPress, onPressIn, onPressOut, silent, ...props }, ref) => {
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
