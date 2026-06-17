import { cuisineRankOf, tapCuisineRank } from '@/core/cuisineRanking';
import { tCuisineLabel } from '@/core/i18nLabels';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

type Props = {
  ranked: string[];
  onChange: (next: string[]) => void;
  accent: string;
  textColor: string;
  tileWidth?: string;
  style?: ViewStyle;
};

export function CuisineRankGrid({
  ranked,
  onChange,
  accent,
  textColor,
  tileWidth = '47%',
  style,
}: Props) {
  const { t } = useTranslation();
  const onTap = (id: string) => onChange(tapCuisineRank(ranked, id));

  return (
    <View style={[styles.grid, style]}>
      {TOP_CUISINE_TILES.map(t => {
        const rank = cuisineRankOf(ranked, t.id);
        const on = rank != null;
        return (
          <Pressable
            key={t.id}
            onPress={() => onTap(t.id)}
            style={[
              styles.tile,
              { width: tileWidth as `${number}%`, borderColor: on ? accent : 'rgba(255,255,255,0.12)' },
              on && { backgroundColor: 'rgba(249,115,82,0.12)' },
            ]}
          >
            {rank != null && (
              <View style={[styles.rankBadge, { backgroundColor: accent }]}>
                <Text style={styles.rankText}>{rank}</Text>
              </View>
            )}
            <Text style={styles.emoji}>{t.emoji}</Text>
            <Text style={[styles.label, { color: textColor }]} numberOfLines={2}>
              {tCuisineLabel(t.id)}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.hint}>{t('onboarding.cuisineTapHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  tile: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  rankText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  emoji: { fontSize: 28, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  hint: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
  },
});
