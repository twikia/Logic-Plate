import type { AiOverview } from '@/core/aiOverviewCache';
import type { ThemeColors } from '@/themes/types';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

export type PerformanceMetric = {
  key: keyof AiOverview;
  labelKey: string;
  emoji: string;
  max: 5 | 10;
};

export const NUTRITION_METRICS: PerformanceMetric[] = [
  { key: 'calorieScore', labelKey: 'calorie', emoji: '🔥', max: 5 },
  { key: 'proteinScore', labelKey: 'protein', emoji: '🥩', max: 5 },
  { key: 'carbScore', labelKey: 'carbBalance', emoji: '🌾', max: 5 },
  { key: 'macroFriendlyScore', labelKey: 'macroFriendly', emoji: '📊', max: 5 },
  { key: 'workoutRecoveryScore', labelKey: 'workout', emoji: '💪', max: 10 },
  { key: 'energySustainScore', labelKey: 'energySustain', emoji: '🔋', max: 5 },
];

export const PERFORMANCE_METRICS: PerformanceMetric[] = [
  { key: 'tasteScore', labelKey: 'taste', emoji: '👅', max: 5 },
  { key: 'valueForMoneyScore', labelKey: 'value', emoji: '💵', max: 5 },
  { key: 'speedScore', labelKey: 'speed', emoji: '⚡', max: 5 },
  { key: 'munchyScore', labelKey: 'munchy', emoji: '🌙', max: 5 },
  { key: 'dateWorthiness', labelKey: 'dateWorthiness', emoji: '💕', max: 5 },
  { key: 'soloDinerScore', labelKey: 'soloDinerFriendly', emoji: '🪑', max: 5 },
  { key: 'workFriendlyScore', labelKey: 'workFriendly', emoji: '💻', max: 5 },
  { key: 'varietyScore', labelKey: 'variety', emoji: '🔄', max: 5 },
];

export function sortMetricsByScore(
  ai: AiOverview | null | undefined,
  metrics: PerformanceMetric[]
): PerformanceMetric[] {
  return [...metrics].sort((a, b) => {
    const av = ai?.[a.key];
    const bv = ai?.[b.key];
    const an = typeof av === 'number' && Number.isFinite(av) ? av / a.max : -1;
    const bn = typeof bv === 'number' && Number.isFinite(bv) ? bv / b.max : -1;
    return bn - an;
  });
}

export function getTopPerformanceMetrics(
  ai: AiOverview | null | undefined,
  count = 3
): { metric: PerformanceMetric; value: number; normalized: number }[] {
  if (!ai) return [];
  return PERFORMANCE_METRICS
    .map(metric => {
      const raw = ai[metric.key];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
      return { metric, value, normalized: (value / metric.max) * 10 };
    })
    .filter(entry => entry.value > 0)
    .sort((a, b) => b.normalized - a.normalized)
    .slice(0, count);
}

type PodiumSlot = 'gold' | 'silver' | 'bronze';

const SLOT_HEIGHTS_DEFAULT = { gold: 88, silver: 64, bronze: 46 };
const SLOT_X_DEFAULT = { silver: 28, gold: 100, bronze: 172 };
const SLOT_HEIGHTS_COMPACT = { gold: 54, silver: 40, bronze: 28 };
const SLOT_X_COMPACT = { silver: 34, gold: 100, bronze: 166 };
const SLOT_COLORS = {
  gold: { top: '#FFE566', left: '#D4A800', right: '#B8860B', glow: '#FFD700' },
  silver: { top: '#E8E8E8', left: '#B0B0B0', right: '#909090', glow: '#C0C0C0' },
  bronze: { top: '#E8A060', left: '#C07030', right: '#A05020', glow: '#CD7F32' },
};

function isoPillar(
  cx: number,
  baseY: number,
  h: number,
  w: number,
  colors: { top: string; left: string; right: string }
) {
  const hw = w / 2;
  const topY = baseY - h;
  const top = `${cx},${topY} ${cx + hw},${topY + hw * 0.5} ${cx},${topY + hw} ${cx - hw},${topY + hw * 0.5}`;
  const left = `${cx - hw},${topY + hw * 0.5} ${cx},${topY + hw} ${cx},${baseY} ${cx - hw},${baseY - hw * 0.5}`;
  const right = `${cx + hw},${topY + hw * 0.5} ${cx + hw},${baseY - hw * 0.5} ${cx},${baseY} ${cx},${topY + hw}`;
  return { top, left, right };
}

function Pillar({
  slot,
  label,
  emoji,
  displayValue,
  compact,
}: {
  slot: PodiumSlot;
  label: string;
  emoji: string;
  displayValue: string;
  compact?: boolean;
}) {
  const heights = compact ? SLOT_HEIGHTS_COMPACT : SLOT_HEIGHTS_DEFAULT;
  const xs = compact ? SLOT_X_COMPACT : SLOT_X_DEFAULT;
  const cx = xs[slot];
  const h = heights[slot];
  const baseY = compact ? 92 : 118;
  const w = compact ? (slot === 'gold' ? 38 : 32) : slot === 'gold' ? 52 : 44;
  const colors = SLOT_COLORS[slot];
  const faces = isoPillar(cx, baseY, h, w, colors);

  return (
    <G>
      <Path d={`M ${faces.left}`} fill={colors.left} />
      <Path d={`M ${faces.right}`} fill={colors.right} />
      <Path d={`M ${faces.top}`} fill={colors.top} />
      <SvgText
        x={cx}
        y={baseY - h - (compact ? 7 : 10)}
        fontSize={compact ? 13 : 16}
        textAnchor="middle"
      >
        {emoji}
      </SvgText>
      <SvgText
        x={cx}
        y={baseY - h / 2 + (compact ? 2 : 4)}
        fill="#FFFFFF"
        fontSize={compact ? 5.5 : 7}
        fontWeight="700"
        textAnchor="middle"
      >
        {label.toUpperCase()}
      </SvgText>
      <SvgText
        x={cx}
        y={baseY - h / 2 + (compact ? 12 : 16)}
        fill="#FFFFFF"
        fontSize={compact ? 9 : 11}
        fontWeight="800"
        textAnchor="middle"
      >
        {displayValue}
      </SvgText>
    </G>
  );
}

type Props = {
  ai: AiOverview | null | undefined;
  theme: ThemeColors;
  compact?: boolean;
  embedded?: boolean;
  title?: string | null;
};

export function VibeStatsPodium({
  ai,
  theme,
  compact = false,
  embedded = false,
  title,
}: Props) {
  const { t } = useTranslation();
  const resolvedTitle = title === undefined ? t('scores.topVibeStats') : title;
  const metricLabel = (metric: PerformanceMetric) => t(`scores.${metric.labelKey}`);
  const top3 = useMemo(() => getTopPerformanceMetrics(ai, 3), [ai]);

  if (top3.length === 0) return null;

  const slotByRank: { slot: PodiumSlot; rank: number }[] = [
    { slot: 'silver', rank: 1 },
    { slot: 'gold', rank: 0 },
    { slot: 'bronze', rank: 2 },
  ];
  const ordered = slotByRank
    .map(({ slot, rank }) => {
      const entry = top3[rank];
      if (!entry) return null;
      const display =
        entry.value % 1 === 0 ? `${entry.value}` : entry.value.toFixed(1);
      return { slot, ...entry, display: `${display}/${entry.metric.max}` };
    })
    .filter(Boolean) as {
    slot: PodiumSlot;
    metric: PerformanceMetric;
    value: number;
    display: string;
  }[];

  const baseY = compact ? 92 : 118;
  const baseFoot = compact ? 102 : 128;
  const svgHeight = compact ? 108 : 140;
  const viewBoxH = compact ? 108 : 130;

  const podium = (
    <>
      <Svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 200 ${viewBoxH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <LinearGradient id="podiumBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.tint} stopOpacity="0.35" />
            <Stop offset="1" stopColor={theme.tint} stopOpacity="0.08" />
          </LinearGradient>
        </Defs>
        <Path
          d={`M 12 ${baseY} L 188 ${baseY} L 178 ${baseFoot} L 22 ${baseFoot} Z`}
          fill="url(#podiumBase)"
          stroke={theme.tint}
          strokeOpacity={0.4}
          strokeWidth={0.8}
        />
        <Path
          d={`M 12 ${baseY} L 22 ${baseFoot} L 22 ${baseY - 10} L 12 ${baseY} Z`}
          fill={theme.tint}
          fillOpacity={0.15}
        />
        <Path
          d={`M 188 ${baseY} L 178 ${baseFoot} L 178 ${baseY - 10} L 188 ${baseY} Z`}
          fill={theme.tint}
          fillOpacity={0.08}
        />
        {ordered.map(({ slot, metric, display }) => (
          <Pillar
            key={slot}
            slot={slot}
            label={metricLabel(metric)}
            emoji={metric.emoji}
            displayValue={display}
            compact={compact}
          />
        ))}
      </Svg>
      {!embedded ? (
        <View style={styles.legend}>
          {ordered.map(({ slot, metric }) => (
            <View key={slot} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: SLOT_COLORS[slot].glow }]}
              />
              <Text style={[styles.legendText, { color: theme.subtext }]}>
                {metric.emoji} {metricLabel(metric)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );

  if (embedded) {
    return <View style={styles.embedded}>{podium}</View>;
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.glassBackground,
          borderColor: theme.cardBorderColor,
        },
      ]}
    >
      {resolvedTitle ? (
        <Text style={[styles.title, { color: theme.text }]}>{resolvedTitle}</Text>
      ) : null}
      {podium}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {
    alignItems: 'center',
    marginBottom: 4,
  },
  wrap: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 11, fontWeight: '600' },
});
