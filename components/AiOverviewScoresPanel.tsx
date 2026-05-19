import { AiOverviewSummaryBody } from '@/components/AiOverviewSummaryBody';
import { AiOverviewRadar } from '@/components/AiOverviewRadar';
import { AI_OVERVIEW_FIELD_PLACEHOLDER, type AiOverview } from '@/core/aiOverviewCache';
import { calculatePlateboundScore } from '@/core/ratingCalculator';
import type { ThemeColors } from '@/themes/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useId, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

type Props = {
  ai?: AiOverview | null;
  ph: boolean;
  theme: ThemeColors;
  googleRating?: number;
  priceLevel?: string;
};

function clamp01(v: number, max: number) {
  return Math.max(0, Math.min(1, v / max));
}

function fmt5(v: number | undefined, ph: boolean) {
  if (ph) return AI_OVERVIEW_FIELD_PLACEHOLDER;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${n.toFixed(1)}/5`;
}

function fmt10(v: number | undefined, ph: boolean) {
  if (ph) return AI_OVERVIEW_FIELD_PLACEHOLDER;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${n.toFixed(1)}/10`;
}

function ExpandableSection({
  title,
  icon,
  accent,
  emoji,
  defaultOpen = false,
  preview,
  theme,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  emoji?: string;
  defaultOpen?: boolean;
  preview?: string;
  theme: ThemeColors;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.section, { borderColor: theme.cardBorderColor }]}>
      <TouchableOpacity style={styles.sectionHead} onPress={() => setOpen((v) => !v)} activeOpacity={0.85}>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Ionicons name={icon} size={16} color={accent} />
        <Text style={[styles.sectionTitle, { color: theme.text, flex: 1 }]}>{title}</Text>
        {!open && preview ? (
          <Text style={[styles.preview, { color: theme.subtext }]} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.subtext} />
      </TouchableOpacity>
      {open ? children : null}
    </View>
  );
}

function ScoreCell({
  emoji,
  label,
  value,
  ph,
  theme,
  max = 5,
  fillColor,
}: {
  emoji: string;
  label: string;
  value: number | undefined;
  ph: boolean;
  theme: ThemeColors;
  max?: 5 | 10;
  fillColor?: string;
}) {
  const n = ph ? 0 : typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = clamp01(n, max);
  const display = max === 10 ? fmt10(value, ph) : fmt5(value, ph);
  const rounded = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <View style={[styles.cell, { borderColor: theme.cardBorderColor, backgroundColor: theme.glassBackground }]}>
      <View style={styles.cellTop}>
        <Text style={styles.cellEmoji}>{emoji}</Text>
        <Text style={[styles.cellLabel, { color: theme.text }]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={[styles.cellVal, { color: theme.tint }]}>{display}</Text>
      </View>
      {max === 5 && !ph ? (
        <View style={styles.stars}>
          {Array.from({ length: 5 }, (_, i) => (
            <Ionicons key={i} name={i < rounded ? 'star' : 'star-outline'} size={12} color="#FFD66B" />
          ))}
        </View>
      ) : (
        <View style={[styles.track, { backgroundColor: theme.glassBackground }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fillColor ?? theme.tint }]} />
        </View>
      )}
    </View>
  );
}

function TwoColGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function ScaleBarCell({
  emoji,
  label,
  value,
  ph,
  theme,
  max,
  lowLabel,
  highLabel,
  fillColor,
}: {
  emoji: string;
  label: string;
  value: number | undefined;
  ph: boolean;
  theme: ThemeColors;
  max: 5 | 10;
  lowLabel: string;
  highLabel: string;
  fillColor?: string;
}) {
  const n = ph ? 0 : typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = clamp01(n, max);
  return (
    <View style={[styles.cell, styles.cellFull, { borderColor: theme.cardBorderColor, backgroundColor: theme.glassBackground }]}>
      <View style={styles.cellTop}>
        <Text style={styles.cellEmoji}>{emoji}</Text>
        <Text style={[styles.cellLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.cellVal, { color: theme.tint }]}>{max === 10 ? fmt10(value, ph) : fmt5(value, ph)}</Text>
      </View>
      <View style={styles.scaleLabels}>
        <Text style={[styles.scaleText, { color: theme.subtext }]}>{lowLabel}</Text>
        <Text style={[styles.scaleText, { color: theme.subtext }]}>{highLabel}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.glassBackground }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fillColor ?? theme.tint }]} />
      </View>
    </View>
  );
}

function GroupedBarChart({
  rows,
  ph,
  theme,
}: {
  rows: { label: string; value: number | undefined; max: 5 | 10; color: string }[];
  ph: boolean;
  theme: ThemeColors;
}) {
  const gid = useId().replace(/:/g, '');
  const chartH = rows.length * 22 + 8;
  const barMaxW = 100;
  return (
    <View style={[styles.chartWrap, { borderColor: theme.cardBorderColor }]}>
      <Svg width="100%" height={chartH} viewBox={`0 0 120 ${chartH}`} preserveAspectRatio="xMidYMid meet">
        {rows.map((row, i) => {
          const n = ph ? 0 : typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
          const w = clamp01(n, row.max) * barMaxW;
          const y = 6 + i * 22;
          return (
            <G key={`${gid}-${row.label}`}>
              <SvgText x={0} y={y + 10} fill={theme.subtext} fontSize={8} fontWeight="600">
                {row.label}
              </SvgText>
              <Rect x={52} y={y + 2} width={barMaxW} height={10} rx={3} fill={theme.glassBackground} />
              <Rect x={52} y={y + 2} width={w} height={10} rx={3} fill={row.color} />
              <SvgText x={116} y={y + 10} fill={theme.text} fontSize={8} fontWeight="700" textAnchor="end">
                {row.max === 10 ? fmt10(row.value, ph) : fmt5(row.value, ph)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function sectionPreview(values: (string | undefined)[], ph: boolean): string | undefined {
  if (ph) return AI_OVERVIEW_FIELD_PLACEHOLDER;
  const parts = values.filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function AiOverviewScoresPanel({ ai, ph, theme, googleRating, priceLevel }: Props) {
  const overall = ph ? null : calculatePlateboundScore(ai, googleRating, priceLevel);
  const border = theme.cardBorderColor;

  return (
    <View style={styles.root}>
      <ExpandableSection
        title="AI overview"
        icon="sparkles-outline"
        accent="#C9A0FF"
        defaultOpen
        theme={theme}
        preview={ph ? AI_OVERVIEW_FIELD_PLACEHOLDER : undefined}
      >
        {ph ? (
          <Text style={[styles.body, { color: theme.subtext }]}>{AI_OVERVIEW_FIELD_PLACEHOLDER}</Text>
        ) : (
          <AiOverviewSummaryBody text={ai!.summaryGoodBad || 'No summary yet.'} style={[styles.body, { color: theme.subtext }]} />
        )}
      </ExpandableSection>

      <View style={[styles.section, styles.glanceSection, { borderColor: border }]}>
        <View style={styles.sectionHead}>
          <Ionicons name="analytics-outline" size={16} color={theme.tint} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>At a glance</Text>
        </View>

        <View style={[styles.overallRow, { borderColor: border, backgroundColor: theme.glassBackground }]}>
          <View style={styles.overallLeft}>
            <Ionicons name="ribbon-outline" size={18} color={theme.tint} />
            <Text style={[styles.overallLabel, { color: theme.subtext }]}>Platebound overall</Text>
          </View>
          <Text style={[styles.overallVal, { color: theme.text }]}>
            {ph ? AI_OVERVIEW_FIELD_PLACEHOLDER : overall != null ? `${overall.toFixed(1)}/10` : '—'}
          </Text>
        </View>

        <View style={styles.healthRow}>
          <Text style={[styles.healthLabel, { color: theme.text }]}>Health score</Text>
          <Text style={[styles.healthVal, { color: '#A8D5A2' }]}>
            {typeof ai?.healthScore === 'number' ? `${ai.healthScore.toFixed(1)}/10` : AI_OVERVIEW_FIELD_PLACEHOLDER}
          </Text>
        </View>
        <View style={[styles.track, styles.healthTrack, { backgroundColor: theme.glassBackground }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${ph ? 0 : clamp01(ai?.healthScore ?? 0, 10) * 100}%`,
                backgroundColor: '#4CD964',
              },
            ]}
          />
        </View>

        <AiOverviewRadar ai={ai} theme={theme} height={190} neon={!!theme.neonColors} />
      </View>

      <ExpandableSection
        title="Flavor & value"
        icon="restaurant-outline"
        accent="#FFB84D"
        emoji="👅"
        theme={theme}
        preview={sectionPreview([fmt5(ai?.tasteScore, ph), fmt5(ai?.valueForMoneyScore, ph)], ph)}
      >
        <TwoColGrid>
          <ScoreCell emoji="👅" label="Taste" value={ai?.tasteScore} ph={ph} theme={theme} />
          <ScoreCell emoji="💵" label="Value for money" value={ai?.valueForMoneyScore} ph={ph} theme={theme} />
        </TwoColGrid>
      </ExpandableSection>

      <ExpandableSection
        title="Convenience"
        icon="flash-outline"
        accent={theme.tint}
        emoji="⚡"
        theme={theme}
        preview={fmt5(ai?.speedScore, ph)}
      >
        <ScaleBarCell
          emoji="⏱️"
          label="Speed"
          value={ai?.speedScore}
          ph={ph}
          theme={theme}
          max={5}
          lowLabel="🐌 slow"
          highLabel="fast ⚡"
        />
      </ExpandableSection>

      <ExpandableSection
        title="Recovery"
        icon="barbell-outline"
        accent={theme.tint}
        emoji="💪"
        theme={theme}
        preview={sectionPreview(
          [fmt10(ai?.workoutRecoveryScore, ph), fmt10(ai?.processedScore, ph), fmt5(ai?.hungoverRecoveryScore, ph)],
          ph
        )}
      >
        <GroupedBarChart
          ph={ph}
          theme={theme}
          rows={[
            { label: 'Workout', value: ai?.workoutRecoveryScore, max: 10, color: theme.tint },
            { label: 'Processed', value: ai?.processedScore, max: 10, color: '#68D8A3' },
            { label: 'Hungover', value: ai?.hungoverRecoveryScore, max: 5, color: '#FFD66B' },
          ]}
        />
        <TwoColGrid>
          <ScoreCell emoji="💪" label="Workout recovery" value={ai?.workoutRecoveryScore} ph={ph} theme={theme} max={10} />
          <ScoreCell emoji="🍎" label="Processed load" value={ai?.processedScore} ph={ph} theme={theme} max={10} fillColor="#68D8A3" />
          <ScoreCell emoji="🥴" label="Hungover recovery" value={ai?.hungoverRecoveryScore} ph={ph} theme={theme} />
        </TwoColGrid>
      </ExpandableSection>

      <ExpandableSection
        title="Cravings & menu"
        icon="fast-food-outline"
        accent="#C9A0FF"
        emoji="🌙"
        theme={theme}
        preview={sectionPreview([fmt5(ai?.munchyScore, ph), fmt5(ai?.varietyScore, ph)], ph)}
      >
        <TwoColGrid>
          <ScoreCell emoji="🌙" label="Munchy score" value={ai?.munchyScore} ph={ph} theme={theme} />
          <ScoreCell emoji="🔄" label="Variety" value={ai?.varietyScore} ph={ph} theme={theme} />
        </TwoColGrid>
      </ExpandableSection>

      <ExpandableSection
        title="Nutrition & portions"
        icon="nutrition-outline"
        accent="#FFD66B"
        emoji="🍽️"
        theme={theme}
        preview={sectionPreview([fmt5(ai?.proteinScore, ph), fmt5(ai?.calorieScore, ph)], ph)}
      >
        <GroupedBarChart
          ph={ph}
          theme={theme}
          rows={[
            { label: 'Calorie', value: ai?.calorieScore, max: 5, color: '#FF8C5A' },
            { label: 'Protein', value: ai?.proteinScore, max: 5, color: '#E85D75' },
            { label: 'Carb', value: ai?.carbScore, max: 5, color: '#D4A84B' },
            { label: 'Macro', value: ai?.macroFriendlyScore, max: 5, color: theme.tint },
          ]}
        />
        <TwoColGrid>
          <ScoreCell emoji="🔥" label="Calorie fit" value={ai?.calorieScore} ph={ph} theme={theme} />
          <ScoreCell emoji="🥩" label="Protein" value={ai?.proteinScore} ph={ph} theme={theme} />
          <ScoreCell emoji="🌾" label="Carb balance" value={ai?.carbScore} ph={ph} theme={theme} />
          <ScoreCell emoji="📊" label="Macro-friendly" value={ai?.macroFriendlyScore} ph={ph} theme={theme} />
        </TwoColGrid>
        {ph ? (
          <Text style={[styles.macros, { color: theme.subtext }]}>{AI_OVERVIEW_FIELD_PLACEHOLDER}</Text>
        ) : ai?.absoluteMacros ? (
          <Text style={[styles.macros, { color: theme.subtext }]}>{ai.absoluteMacros}</Text>
        ) : null}
      </ExpandableSection>

      <ExpandableSection
        title="Vibe & social"
        icon="people-outline"
        accent="#E9A0C8"
        emoji="💫"
        theme={theme}
        preview={sectionPreview(
          [
            fmt5(ai?.dateWorthiness, ph),
            fmt5(ai?.noiseLevelEstimate, ph),
            ph
              ? AI_OVERVIEW_FIELD_PLACEHOLDER
              : ai?.groupSizeSweetSpot != null
                ? `${ai.groupSizeSweetSpot} ppl`
                : undefined,
          ],
          ph
        )}
      >
        <TwoColGrid>
          <ScoreCell emoji="💕" label="Date worthiness" value={ai?.dateWorthiness} ph={ph} theme={theme} />
          <ScoreCell emoji="🔊" label="Noise level" value={ai?.noiseLevelEstimate} ph={ph} theme={theme} />
        </TwoColGrid>
        <View style={[styles.cell, styles.cellFull, { borderColor: border, backgroundColor: theme.glassBackground, marginTop: 8 }]}>
          <View style={styles.cellTop}>
            <Text style={styles.cellEmoji}>👥</Text>
            <Text style={[styles.cellLabel, { color: theme.text }]}>Group sweet spot</Text>
            <Text style={[styles.cellVal, { color: theme.tint }]}>
              {ph
                ? AI_OVERVIEW_FIELD_PLACEHOLDER
                : ai?.groupSizeSweetSpot != null
                  ? `${ai.groupSizeSweetSpot} people`
                  : '—'}
            </Text>
          </View>
        </View>
      </ExpandableSection>

      <ExpandableSection
        title="Solo & work"
        icon="laptop-outline"
        accent="#9BC99D"
        emoji="💻"
        theme={theme}
        preview={sectionPreview([fmt5(ai?.soloDinerScore, ph), fmt5(ai?.workFriendlyScore, ph)], ph)}
      >
        <TwoColGrid>
          <ScoreCell emoji="🪑" label="Solo diner friendly" value={ai?.soloDinerScore} ph={ph} theme={theme} />
          <ScoreCell emoji="💻" label="Work friendly" value={ai?.workFriendlyScore} ph={ph} theme={theme} />
        </TwoColGrid>
        <ScaleBarCell
          emoji="🔋"
          label="Energy sustain"
          value={ai?.energySustainScore}
          ph={ph}
          theme={theme}
          max={5}
          lowLabel="⚡ crashy"
          highLabel="slow sustain"
          fillColor="#7EC8E3"
        />
      </ExpandableSection>

      <View style={[styles.section, styles.whoSection, { borderColor: theme.tint + '44' }]}>
        <View style={styles.sectionHead}>
          <Text style={styles.emoji}>🎯</Text>
          <Ionicons name="person-outline" size={16} color="#B8E0FF" />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Who is this place for?</Text>
        </View>
        <Text style={[styles.body, { color: theme.subtext }]}>
          {ph ? AI_OVERVIEW_FIELD_PLACEHOLDER : ai?.whoThisPlaceIsFor || '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  glanceSection: { gap: 12 },
  whoSection: {},
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  preview: { fontSize: 11, fontWeight: '600', maxWidth: 100 },
  emoji: { fontSize: 15 },
  body: { fontSize: 14, lineHeight: 20 },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  overallLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overallLabel: { fontSize: 13, fontWeight: '600' },
  overallVal: { fontSize: 16, fontWeight: '800' },
  healthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthLabel: { fontSize: 13, fontWeight: '700' },
  healthVal: { fontSize: 13, fontWeight: '800' },
  healthTrack: { marginTop: -4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  cell: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  cellFull: { width: '100%' },
  cellTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cellEmoji: { fontSize: 14 },
  cellLabel: { flex: 1, fontSize: 11, fontWeight: '700', minWidth: 60 },
  cellVal: { fontSize: 11, fontWeight: '800' },
  stars: { flexDirection: 'row', gap: 2 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontSize: 10, fontWeight: '600' },
  chartWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  macros: { fontSize: 13, lineHeight: 20, fontWeight: '600', marginTop: 4 },
});
