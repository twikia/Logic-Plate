import type { AiOverview } from '@/core/aiOverviewCache';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const FILLED_BEST = '#00E5FF';
const FILLED_WORST = '#FF007F';
const FILLED_OTHER = '#90A4AE';
const SEG_UNFILLED = 'rgba(255,255,255,0.08)';
const SEG_COUNT = 5;
const SEG_GAP = 3;
const SEG_HEIGHT = 8;

function clampScore(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

function scoreAxis(ai: AiOverview | null | undefined, key: keyof AiOverview): number | null {
  if (!ai) return null;
  const v = ai[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatScore(max: 5 | 10, s: number | null): string {
  if (s == null) return '—';
  if (max === 10) return `${clampScore(s, max).toFixed(1)}/${max}`;
  return `${Math.round(clampScore(s, max))}/${max}`;
}

function AnimatedSegment({
  filled,
  color,
  delay,
}: {
  filled: boolean;
  color: string;
  delay: number;
}) {
  const fillOpacity = useSharedValue(0);

  useEffect(() => {
    fillOpacity.value = 0;
    if (filled) {
      fillOpacity.value = withDelay(delay, withTiming(1, { duration: 280 }));
    }
  }, [filled, color, delay, fillOpacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fillOpacity.value,
  }));

  return (
    <View style={styles.segBase}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: color }, animStyle]}
      />
    </View>
  );
}

const METRICS: { key: keyof AiOverview; label: string; max: 5 | 10 }[] = [
  { key: 'tasteScore', label: 'Taste', max: 5 },
  { key: 'valueForMoneyScore', label: 'Value', max: 5 },
  { key: 'dateWorthiness', label: 'Date', max: 5 },
  { key: 'healthScore', label: 'Health', max: 10 },
  { key: 'speedScore', label: 'Speed', max: 5 },
];

type Props = {
  ai: AiOverview | null | undefined;
};

export function SegmentedScoreBar({ ai }: Props) {
  const normalizedScores = METRICS.map(({ key, max }) => {
    const s = scoreAxis(ai, key);
    if (s == null) return 0;
    return Math.round((clampScore(s, max) / max) * SEG_COUNT);
  });

  const maxNorm = Math.max(...normalizedScores);
  const minNorm = Math.min(...normalizedScores);

  const getColor = (norm: number): string => {
    if (maxNorm === minNorm) return FILLED_OTHER;
    if (norm === maxNorm) return FILLED_BEST;
    if (norm === minNorm) return FILLED_WORST;
    return FILLED_OTHER;
  };

  return (
    <View style={styles.container}>
      {METRICS.map(({ key, label, max }, rowIdx) => {
        const s = scoreAxis(ai, key);
        const norm = normalizedScores[rowIdx];
        const color = getColor(norm);
        const reading = formatScore(max, s);

        return (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.barContainer}>
              {Array.from({ length: SEG_COUNT }, (_, segIdx) => (
                <AnimatedSegment
                  key={segIdx}
                  filled={segIdx < norm}
                  color={color}
                  delay={rowIdx * 30 + segIdx * 50}
                />
              ))}
            </View>
            <Text style={styles.score}>{reading}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 10,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    width: 44,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: SEG_GAP,
  },
  segBase: {
    flex: 1,
    height: SEG_HEIGHT,
    borderRadius: 2,
    backgroundColor: SEG_UNFILLED,
    overflow: 'hidden',
  },
  score: {
    width: 38,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
  },
});
