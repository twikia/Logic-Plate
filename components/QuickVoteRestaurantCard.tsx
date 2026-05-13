import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RestaurantImage } from '@/core/images';
import type { ThemeColors } from '@/constants/Themes';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import {
  healthTierFromPrimaryType,
  oneLineVibe,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

function healthScoreOf(r: QuickVoteRestaurant): number | null {
  const fromAi = r.aiOverview?.healthScore;
  if (typeof fromAi === 'number' && Number.isFinite(fromAi)) return fromAi;
  const top = (r as { healthScore?: unknown }).healthScore;
  if (typeof top === 'number' && Number.isFinite(top)) return top;
  return healthTierFromPrimaryType(r.primaryType);
}

function aiOverviewBody(r: QuickVoteRestaurant): string {
  const g = r.gemini_summary?.trim();
  if (g) return g;
  const s = r.aiOverview?.summaryGoodBad?.trim();
  if (s) return s;
  const ed = r.editorialSummary?.text?.trim();
  if (ed) return ed;
  return '';
}

type Props = {
  restaurant: QuickVoteRestaurant;
  theme: ThemeColors;
  onVote?: () => void;
  showThumbnail?: boolean;
  hideTitle?: boolean;
  belowOverview?: React.ReactNode;
};

export function QuickVoteRestaurantCard({
  restaurant: r,
  theme,
  onVote,
  showThumbnail = true,
  hideTitle = false,
  belowOverview,
}: Props) {
  const { formatDistance } = useDistanceFormatter();
  const health = healthScoreOf(r);
  const healthPct = health != null ? Math.max(0, Math.min(100, (health / 10) * 100)) : 0;
  const overview = aiOverviewBody(r);
  const vibeLine = oneLineVibe(r);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '22' },
      ]}>
      <View style={[styles.cardRow, !showThumbnail && styles.cardRowStack]}>
        {showThumbnail ? (
          <RestaurantImage
            restaurantId={r.id}
            photos={(r as { photos?: unknown[] }).photos ?? []}
            width={72}
            height={72}
            borderRadius={12}
          />
        ) : null}
        <View style={[styles.cardBody, !showThumbnail && styles.cardBodyFull]}>
          {!hideTitle ? (
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
              {r.displayName?.text ?? 'Restaurant'}
            </Text>
          ) : null}
          <View style={styles.healthRow}>
            <Text style={[styles.healthLabel, { color: theme.subtext }]}>Health</Text>
            <View style={[styles.healthBar, { backgroundColor: theme.subtext + '18' }]}>
              {health != null ? (
                <View
                  style={[styles.healthFill, { width: `${healthPct}%`, backgroundColor: '#4CD964' }]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.healthValue,
                { color: health != null ? theme.tint : theme.subtext },
              ]}>
              {health != null ? `${health.toFixed(1)}/10` : '—'}
            </Text>
          </View>
          <Text style={[styles.meta, { color: theme.subtext }]}>
            {typeof r.rating === 'number' ? `Rating ${r.rating.toFixed(1)} ★` : 'Rating —'}
            {typeof r.distanceMeters === 'number' ? `  ·  ${formatDistance(r.distanceMeters)}` : ''}
          </Text>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>AI overview</Text>
          <Text style={[styles.overview, { color: theme.subtext }]}>
            {overview || 'No overview yet for this place.'}
          </Text>
          {belowOverview}
          {!overview && vibeLine ? (
            <Text style={[styles.vibe, { color: theme.subtext }]} numberOfLines={3}>
              {vibeLine}
            </Text>
          ) : null}
          {onVote ? (
            <TouchableOpacity
              style={[styles.voteBtn, { backgroundColor: theme.accent }]}
              onPress={onVote}>
              <Text style={[styles.voteBtnText, { color: theme.text }]}>Vote for this</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  cardRowStack: { flexDirection: 'column' },
  cardBody: { flex: 1, minWidth: 0 },
  cardBodyFull: { width: '100%' },
  name: { fontSize: 17, fontWeight: '700' },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  healthLabel: { fontSize: 12, fontWeight: '600', width: 48 },
  healthBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  healthFill: { height: '100%', borderRadius: 2 },
  healthValue: { fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  meta: { fontSize: 13, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginTop: 12 },
  overview: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  vibe: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  voteBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  voteBtnText: { fontWeight: '700', fontSize: 16 },
});
