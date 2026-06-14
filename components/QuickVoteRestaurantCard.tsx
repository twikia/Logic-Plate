import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RestaurantImage } from '@/core/images';
import { formatRestaurantCostLabel } from '@/core/placePriceLabel';
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
  voted?: boolean;
  showThumbnail?: boolean;
  hideTitle?: boolean;
  belowOverview?: React.ReactNode;
};

export function QuickVoteRestaurantCard({
  restaurant: r,
  theme,
  onVote,
  voted = false,
  showThumbnail = true,
  hideTitle = false,
  belowOverview,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { formatDistance } = useDistanceFormatter();
  const health = healthScoreOf(r);
  const healthPct = health != null ? Math.max(0, Math.min(100, (health / 10) * 100)) : 0;
  const overview = aiOverviewBody(r);
  const vibeLine = oneLineVibe(r);
  const cost = formatRestaurantCostLabel(r as never);
  const name = r.displayName?.text ?? 'Restaurant';
  const lat = r.location?.latitude;
  const lng = r.location?.longitude;
  const metaParts: string[] = [];
  if (typeof r.rating === 'number') metaParts.push(`${r.rating.toFixed(1)} ★`);
  if (cost) metaParts.push(cost);
  if (typeof r.distanceMeters === 'number') metaParts.push(formatDistance(r.distanceMeters));

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => setExpanded((prev) => !prev)}
      style={[
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderColor: expanded ? theme.accent + '55' : theme.subtext + '22',
        },
      ]}>
      <View style={styles.headerRow}>
        {showThumbnail ? (
          <RestaurantImage
            restaurantId={r.id}
            photos={(r as { photos?: unknown[] }).photos ?? []}
            photoUrl={r.photo_url}
            name={name}
            latitude={lat}
            longitude={lng}
            websiteUrl={(r as { websiteUri?: string }).websiteUri}
            formattedAddress={r.formattedAddress}
            cuisineKey={r.primaryType?.replace(/_restaurant$/, '')}
            width={68}
            height={68}
            borderRadius={12}
          />
        ) : null}
        <View style={styles.infoCol}>
          {!hideTitle ? (
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
              {name}
            </Text>
          ) : null}
          {metaParts.length > 0 ? (
            <Text style={[styles.meta, { color: theme.subtext }]}>
              {metaParts.join('  ·  ')}
            </Text>
          ) : null}
          <Text style={[styles.expandHint, { color: theme.accent }]}>
            {expanded ? 'Less ▲' : 'Details ▾'}
          </Text>
        </View>
        {onVote ? (
          <TouchableOpacity
            onPress={onVote}
            hitSlop={8}
            style={[
              styles.voteBox,
              {
                borderColor: voted ? theme.accent : theme.subtext + '55',
                backgroundColor: voted ? theme.accent + '33' : 'transparent',
              },
            ]}>
            {voted ? (
              <Text style={[styles.voteCheck, { color: theme.accent }]}>✓</Text>
            ) : (
              <Text style={[styles.voteLabel, { color: theme.subtext }]}>Vote</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.expandedContent}>
          <View style={[styles.divider, { backgroundColor: theme.subtext + '22' }]} />
          {health != null ? (
            <View style={styles.healthRow}>
              <Text style={[styles.healthLabel, { color: theme.subtext }]}>Health</Text>
              <View style={[styles.healthBar, { backgroundColor: theme.subtext + '18' }]}>
                <View
                  style={[styles.healthFill, { width: `${healthPct}%`, backgroundColor: '#4CD964' }]}
                />
              </View>
              <Text style={[styles.healthValue, { color: theme.tint }]}>
                {health.toFixed(1)}/10
              </Text>
            </View>
          ) : null}
          {overview ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.subtext }]}>AI overview</Text>
              <Text style={[styles.overview, { color: theme.text }]}>{overview}</Text>
            </>
          ) : vibeLine ? (
            <Text style={[styles.vibe, { color: theme.subtext }]} numberOfLines={4}>
              {vibeLine}
            </Text>
          ) : null}
          {belowOverview}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  meta: { fontSize: 13, marginTop: 2 },
  expandHint: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  voteBox: {
    width: 56,
    height: 56,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voteLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  voteCheck: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  expandedContent: {
    marginTop: 12,
  },
  divider: { height: 1, marginBottom: 12 },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  healthLabel: { fontSize: 12, fontWeight: '600', width: 48 },
  healthBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  healthFill: { height: '100%', borderRadius: 2 },
  healthValue: { fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  sectionLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  overview: { fontSize: 14, lineHeight: 21 },
  vibe: { fontSize: 14, lineHeight: 21 },
});
