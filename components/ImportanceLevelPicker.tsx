import {
  IMPORTANCE_LEVEL_EMOJIS,
  IMPORTANCE_LEVEL_LABELS,
  PRIORITY_METRIC_SCREENS,
  type PriorityMetricDef,
} from '@/core/recommendationPriorityMetrics';
import type { ImportanceLevel, RecommendationWeights } from '@/core/recommendationTypes';
import { useAppTheme } from '@/context/ThemeContext';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { hapticLight } from '@/core/haptics';

const LEVELS: ImportanceLevel[] = [1, 2, 3, 4, 5];

type Props = {
  metric: PriorityMetricDef;
  value: ImportanceLevel;
  onChange: (level: ImportanceLevel) => void;
  compact?: boolean;
};

export function ImportanceLevelPicker({ metric, value, onChange, compact }: Props) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();

  const labelKey = `priorities.${metric.key}Label`;
  const hintKey = `priorities.${metric.key}Hint`;
  const rangeLowKey = metric.key === 'calories' ? 'priorities.caloriesLow' : null;
  const rangeHighKey = metric.key === 'calories' ? 'priorities.caloriesHigh' : null;

  const displayLabel = t(labelKey, { defaultValue: metric.label });
  const displayHint = t(hintKey, { defaultValue: metric.hint });
  const displayRangeLow = rangeLowKey ? t(rangeLowKey) : (metric.rangeLowLabel ?? null);
  const displayRangeHigh = rangeHighKey ? t(rangeHighKey) : (metric.rangeHighLabel ?? null);

  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <View style={styles.head}>
        <Text style={styles.metricIcon}>{metric.icon}</Text>
        <View style={styles.headText}>
          <Text style={[styles.label, { color: theme.text }]}>{displayLabel}</Text>
          {!compact && <Text style={[styles.hint, { color: theme.subtext }]}>{displayHint}</Text>}
        </View>
        <Text style={[styles.levelBadge, { color: theme.accent }]}>
          {IMPORTANCE_LEVEL_EMOJIS[value]} {t(`priorities.importance_${value}`, { defaultValue: IMPORTANCE_LEVEL_LABELS[value] })}
        </Text>
      </View>
      <View style={styles.levelRow}>
        {LEVELS.map(level => {
          const active = value === level;
          return (
            <Pressable
              key={level}
              onPress={() => { hapticLight(); onChange(level); }}
              style={[
                styles.levelBtn,
                compact && styles.levelBtnCompact,
                { borderColor: active ? theme.accent : 'rgba(255,255,255,0.14)' },
                active && { backgroundColor: 'rgba(249,115,82,0.16)' },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${displayLabel} importance ${t(`priorities.importance_${level}`, { defaultValue: IMPORTANCE_LEVEL_LABELS[level] })}`}
            >
              <Text style={[styles.levelEmoji, compact && styles.levelEmojiCompact]}>
                {IMPORTANCE_LEVEL_EMOJIS[level]}
              </Text>
              <Text style={[styles.levelNum, { color: active ? theme.accent : theme.subtext }]}>{level}</Text>
            </Pressable>
          );
        })}
      </View>
      {displayRangeLow && displayRangeHigh ? (
        <View style={styles.rangeRow}>
          <Text style={[styles.rangeLabel, { color: theme.subtext }]}>{displayRangeLow}</Text>
          <Text style={[styles.rangeLabel, styles.rangeLabelRight, { color: theme.subtext }]}>
            {displayRangeHigh}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type PanelProps = {
  weights: RecommendationWeights;
  onWeightChange: (key: keyof RecommendationWeights, level: ImportanceLevel) => void;
  screenIndex: number;
  compact?: boolean;
};

export function PriorityMetricsPanel({ weights, onWeightChange, screenIndex, compact }: PanelProps) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const screen = PRIORITY_METRIC_SCREENS[screenIndex];
  if (!screen) return null;

  return (
    <View style={styles.panel}>
      {!compact && (
        <>
          <Text style={[styles.screenTitle, { color: theme.text }]}>
            {t(`priorities.${screen.id}Title`, { defaultValue: screen.title })}
          </Text>
          <Text style={[styles.screenSub, { color: theme.subtext }]}>
            {t(`priorities.${screen.id}Subtitle`, { defaultValue: screen.subtitle })}
          </Text>
        </>
      )}
      {screen.metrics.map(metric => (
        <ImportanceLevelPicker
          key={metric.key}
          metric={metric}
          value={weights[metric.key]}
          onChange={level => onWeightChange(metric.key, level)}
          compact={compact}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  screenTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  screenSub: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  block: { marginBottom: 6 },
  blockCompact: { marginBottom: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  metricIcon: { fontSize: 22, marginTop: 2 },
  headText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  levelBadge: { fontSize: 11, fontWeight: '700', maxWidth: 96, textAlign: 'right' },
  levelRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  levelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 0,
  },
  levelBtnCompact: { paddingVertical: 8 },
  levelEmoji: { fontSize: 22 },
  levelEmojiCompact: { fontSize: 18 },
  levelNum: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  rangeLabel: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 15 },
  rangeLabelRight: { textAlign: 'right' },
});
