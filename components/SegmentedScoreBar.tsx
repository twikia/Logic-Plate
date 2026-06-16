import type { AiOverview } from '@/core/aiOverviewCache';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const FILLED_GOOD = '#4CD964';
const FILLED_MID = '#FF9500';
const FILLED_BAD = '#FF4444';
const FILLED_UNKNOWN = '#90A4AE';
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

function formatScore(max: 5 | 10, s: number | null, missing: string): string {
  if (s == null) return missing;
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

const METRICS: { key: keyof AiOverview; labelKey: string; max: 5 | 10 }[] = [
  { key: 'tasteScore', labelKey: 'taste', max: 5 },
  { key: 'valueForMoneyScore', labelKey: 'value', max: 5 },
  { key: 'dateWorthiness', labelKey: 'dateWorthiness', max: 5 },
  { key: 'healthScore', labelKey: 'health', max: 10 },
  { key: 'speedScore', labelKey: 'speed', max: 5 },
];

type Props = {
  ai: AiOverview | null | undefined;
};

function absoluteScoreColor(score: number | null, max: 5 | 10): string {
  if (score == null) return FILLED_UNKNOWN;
  const norm10 = (clampScore(score, max) / max) * 10;
  if (norm10 >= 7) return FILLED_GOOD;
  if (norm10 >= 4.5) return FILLED_MID;
  return FILLED_BAD;
}

export function SegmentedScoreBar({ ai }: Props) {
  const { t } = useTranslation();
  const missing = t('common.missingScore');

  return (
    <View style={styles.container}>
      {METRICS.map(({ key, labelKey, max }, rowIdx) => {
        const s = scoreAxis(ai, key);
        const norm = (() => {
          if (s == null) return 0;
          return Math.round((clampScore(s, max) / max) * SEG_COUNT);
        })();
        const color = absoluteScoreColor(s, max);
        const reading = formatScore(max, s, missing);

        return (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{t(`scores.${labelKey}`)}</Text>
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
            <Text style={[styles.score, { color: color }]}>{reading}</Text>
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
    color: 'rgba(255,255,255,0.92)',
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
    fontWeight: '700',
    textAlign: 'right',
  },
});
