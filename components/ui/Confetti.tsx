import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CONFETTI_COUNT = 60;
const COLORS = ['#FFC700', '#FF0000', '#2E3192', '#41BBC7', '#00A859', '#FF007F'];

const ConfettiPiece = ({ index, color }: { index: number; color: string }) => {
  // Start near the top center where the progress bar usually is
  const translateY = useSharedValue(100);
  const translateX = useSharedValue(SCREEN_W / 2);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    // Spread out randomly over 1 second
    const delay = Math.random() * 1000;
    
    // Spread horizontally across the whole screen and beyond
    const finalX = (Math.random() - 0.5) * SCREEN_W * 1.5 + SCREEN_W / 2;
    // Fall down below the screen
    const finalY = SCREEN_H + 100;
    
    translateX.value = withDelay(delay, withTiming(finalX, { duration: 3000, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(finalY, { duration: 3000, easing: Easing.in(Easing.quad) }));
    rotate.value = withDelay(delay, withTiming(Math.random() * 1000, { duration: 3000 }));
    opacity.value = withDelay(delay + 2000, withTiming(0, { duration: 1000 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { rotateX: `${rotate.value}deg` },
      { rotateY: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { backgroundColor: color },
        animStyle,
      ]}
    />
  );
};

export function Confetti() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece key={i} index={i} color={COLORS[i % COLORS.length]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 8,
    height: 12,
    borderRadius: 2,
  }
});
