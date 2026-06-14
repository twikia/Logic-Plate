import React, { useId } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';

const NEON_CYAN = '#00FFFF';
const NEON_MAGENTA = '#FF00FF';

type Props = {
  text: string;
  width: number;
  fontSize?: number;
  style?: ViewStyle;
};

export function NeonGradientTitle({ text, width, fontSize = 29, style }: Props) {
  const gid = useId().replace(/:/g, '');
  const h = Math.round(fontSize * 1.45);

  return (
    <View style={[styles.wrap, { height: h, marginBottom: 4 }, style]}>
      <Svg width={width} height={h}>
        <Defs>
          <SvgLinearGradient id={`ngt-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={NEON_CYAN} />
            <Stop offset="1" stopColor={NEON_MAGENTA} />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          fill={`url(#ngt-${gid})`}
          fontSize={fontSize}
          fontWeight="800"
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
