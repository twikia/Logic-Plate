import {
  IMPORTANCE_LEVEL_EMOJIS,
  IMPORTANCE_LEVEL_LABELS,
  PRIORITY_METRIC_SCREENS,
  type PriorityMetricDef,
} from '@/core/recommendationPriorityMetrics';
import type { ImportanceLevel, RecommendationWeights } from '@/core/recommendationTypes';
import { useAppTheme } from '@/context/ThemeContext';
import React from 'react';
import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { hapticLight } from '@/core/haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const LEVELS: ImportanceLevel[] = [1, 2, 3, 4, 5];

function AnimatedOption({
  level,
  active,
  displayLabel,
  emoji,
  theme,
  compact,
  onSelect,
  t,
}: {
  level: ImportanceLevel;
  active: boolean;
  displayLabel: string;
  emoji: string;
  theme: any;
  compact?: boolean;
  onSelect: () => void;
  t: any;
}) {
  const scale = useSharedValue(1);
  const rot = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }));

  const handlePress = () => {
    hapticLight();
    scale.value = withSequence(
      withTiming(1.22, { duration: 180 }),
      withTiming(0.95, { duration: 130 }),
      withTiming(1.0, { duration: 110 })
    );
    rot.value = withSequence(
      withTiming(-4, { duration: 90 }),
      withTiming(0, { duration: 90 })
    );
    onSelect();
  };

  return (
    <Animated.View style={[{ flex: 1 }, animStyle]}>
      <Pressable
        animated={false}
        onPress={handlePress}
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
          {emoji}
        </Text>
        <Text style={[styles.levelNum, { color: active ? theme.accent : theme.subtext }]}>{level}</Text>
      </Pressable>
    </Animated.View>
  );
}

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

  const emojiMap = metric.customLevelEmojis || IMPORTANCE_LEVEL_EMOJIS;
  const activeEmoji = emojiMap[value] || IMPORTANCE_LEVEL_EMOJIS[value];

  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <View style={styles.head}>
        <Text style={styles.metricIcon}>{metric.icon}</Text>
        <View style={styles.headText}>
          <Text style={[styles.label, { color: theme.text }]}>{displayLabel}</Text>
          {!compact && <Text style={[styles.hint, { color: theme.subtext }]}>{displayHint}</Text>}
        </View>
        <Text style={[styles.levelBadge, { color: theme.accent }]}>
          {activeEmoji} {t(`priorities.importance_${value}`, { defaultValue: IMPORTANCE_LEVEL_LABELS[value] })}
        </Text>
      </View>
      <View style={styles.levelRow}>
        {LEVELS.map(level => {
          const active = value === level;
          const emoji = emojiMap[level] || IMPORTANCE_LEVEL_EMOJIS[level];
          return (
            <AnimatedOption
              key={level}
              level={level}
              active={active}
              displayLabel={displayLabel}
              emoji={emoji}
              theme={theme}
              compact={compact}
              onSelect={() => onChange(level)}
              t={t}
            />
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
          <Text style={[styles.screenTitle, { color: theme.text, textAlign: 'center' }]}>
            {t(`priorities.${screen.id}Title`, { defaultValue: screen.title })}
          </Text>
          <Text style={[styles.screenSub, { color: theme.subtext, textAlign: 'center' }]}>
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
