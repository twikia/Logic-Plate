import React, { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '@/context/ThemeContext';

const NEON_CYAN = '#00FFFF';
const NEON_MAGENTA = '#FF00FF';
const DEFAULT_PALETTE = [NEON_CYAN, '#9400FF', NEON_MAGENTA, NEON_CYAN] as const;

type Props = {
  text: string;
  width: number;
  fontSize?: number;
  style?: ViewStyle;
};

export function NeonGradientTitle({ text, width, fontSize = 29, style }: Props) {
  const gid = useId().replace(/:/g, '');
  const h = Math.round(fontSize * 1.45);
  const { theme } = useAppTheme();
  const palette = theme.neonColors ?? DEFAULT_PALETTE;
  const fontFamily = theme.fontFamily ?? undefined;

  const c0 = palette[0];
  const c1 = palette[1];
  const c2 = palette[2];
  const c3 = palette[3] ?? palette[0];

  const [stop0Color, setStop0Color] = useState(c0);
  const [stop1Color, setStop1Color] = useState(c1);

  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [phase]);

  useEffect(() => {
    setStop0Color(c0);
    setStop1Color(c1);
  }, [c0, c1]);

  useAnimatedReaction(
    () => phase.value,
    (value) => {
      runOnJS(setStop0Color)(interpolateColor(value, [0, 1], [c0, c2]));
      runOnJS(setStop1Color)(interpolateColor(value, [0, 1], [c1, c3]));
    },
    [c0, c1, c2, c3],
  );

  return (
    <View style={[styles.wrap, { height: h, marginBottom: 4 }, style]}>
      <Svg width={width} height={h}>
        <Defs>
          <SvgLinearGradient id={`ngt-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={stop0Color} />
            <Stop offset="1" stopColor={stop1Color} />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          fill={`url(#ngt-${gid})`}
          fontSize={fontSize}
          fontWeight="800"
          fontFamily={fontFamily}
          x={width / 2}
          y={h - 11}
          textAnchor="middle"
        >
          {text}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
