import type { AiOverview } from '@/core/aiOverviewCache';
import type { ThemeColors } from '@/themes/types';
import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

function clampScore(v: number, max: number) {
  return Math.max(0, Math.min(max, v));
}

function polygonRing(cx: number, cy: number, radius: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return `${cx + radius * Math.cos(t)},${cy + radius * Math.sin(t)}`;
  }).join(' ');
}

function scoreAxis(ai: AiOverview | null | undefined, key: keyof AiOverview): number | null {
  if (!ai) return null;
  const v = ai[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatAxisReading(max: 5 | 10, s: number | null): string {
  if (s == null) return '—';
  if (max === 10) return `${clampScore(s, max).toFixed(1)}/${max}`;
  return `${Math.round(clampScore(s, max))}/${max}`;
}

type Props = {
  ai: AiOverview | null | undefined;
  theme: ThemeColors;
  height?: number;
  neon?: boolean;
};

export function AiOverviewRadar({ ai, theme, height = 200, neon }: Props) {
  const gid = useId().replace(/:/g, '');
  const n = 5;
  const axes: { key: keyof AiOverview; corner: string; max: 5 | 10 }[] = [
    { key: 'healthScore', corner: 'Health', max: 10 },
    { key: 'tasteScore', corner: 'Taste', max: 5 },
    { key: 'valueForMoneyScore', corner: 'Value', max: 5 },
    { key: 'dateWorthiness', corner: 'Date', max: 5 },
    { key: 'speedScore', corner: 'Speed', max: 5 },
  ];
  const norms = axes.map(({ key, max }) => {
    const s = scoreAxis(ai, key);
    if (s == null) return 0;
    return clampScore(s, max) / max;
  });
  const cx = 50;
  const cy = 50;
  const R = 40;
  const labelR = 47;
  const fillPts = norms
    .map((norm, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = norm * R;
      return `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`;
    })
    .join(' ');

  const radarVar = theme.radarVariant ?? 'solid';
  const useNeon = neon ?? !!theme.neonColors;
  const stroke = theme.tint;
  const gridColor = theme.radarGridColor;
  const labelColor = theme.subtext;
  const useGradient = useNeon || radarVar === 'gradient';
  const gradFrom = useNeon ? theme.tint : theme.matchOrbColors[0];
  const gradTo = useNeon ? theme.matchOrbColors[1] : theme.matchOrbColors[1];
  const ringStroke = useNeon ? theme.tint : stroke;
  const ringGrid = gridColor;
  const ringLabel = labelColor;
  const fillValue = useGradient ? `url(#pf-${gid})` : `${stroke}55`;

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet">
        <Defs>
          {useGradient && (
            <SvgLinearGradient id={`pf-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradFrom} stopOpacity={0.58} />
              <Stop offset="0.5" stopColor={gradFrom} stopOpacity={0.42} />
              <Stop offset="1" stopColor={gradTo} stopOpacity={0.52} />
            </SvgLinearGradient>
          )}
        </Defs>
        <Polygon points={polygonRing(cx, cy, R * 0.34, n)} fill="rgba(128,128,128,0.04)" stroke={ringGrid} strokeWidth={0.35} />
        <Polygon points={polygonRing(cx, cy, R * 0.67, n)} fill="rgba(128,128,128,0.04)" stroke={ringGrid} strokeWidth={0.35} />
        <Polygon points={polygonRing(cx, cy, R, n)} fill="rgba(128,128,128,0.05)" stroke={ringGrid} strokeWidth={0.45} />
        <Polygon points={fillPts} fill={fillValue} stroke={ringStroke} strokeWidth={1.25} strokeLinejoin="round" />
        {axes.map(({ key, corner, max }, i) => {
          const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const lx = cx + labelR * Math.cos(t);
          const ly = cy + labelR * Math.sin(t);
          const s = scoreAxis(ai, key);
          const reading = formatAxisReading(max, s);
          return (
            <G key={corner}>
              <SvgText x={lx} y={ly - 2.4} fill={ringLabel} fontSize={5} fontWeight="700" textAnchor="middle" alignmentBaseline="middle">
                {corner}
              </SvgText>
              <SvgText x={lx} y={ly + 3.6} fill={ringLabel} fontSize={4.1} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
                {reading}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
