import React from 'react';
import { Pressable, PressableProps } from 'react-native';
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

export function AnimatedPressable({ children, style, onPressIn, onPressOut, ...props }: PressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressableComponent
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withTiming(0.86, { duration: DOWN_MS, easing: Easing.out(Easing.quad) });
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e) => {
        scale.value = withSequence(
          withTiming(1.04, { duration: UP_MS,    easing: Easing.out(Easing.quad) }),
          withTiming(1.0,  { duration: SETTLE_MS, easing: Easing.inOut(Easing.quad) })
        );
        if (onPressOut) onPressOut(e);
      }}
    >
      {children}
    </AnimatedPressableComponent>
  );
}
