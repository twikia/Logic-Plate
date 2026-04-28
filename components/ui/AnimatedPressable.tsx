import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressableComponent = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, style, onPressIn, onPressOut, ...props }: PressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <AnimatedPressableComponent
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        if (onPressOut) onPressOut(e);
      }}
    >
      {children}
    </AnimatedPressableComponent>
  );
}
