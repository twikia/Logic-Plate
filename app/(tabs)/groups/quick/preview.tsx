import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { BackButton } from '@/components/ui/BackButton';
import { useAppTheme } from '@/context/ThemeContext';
import {
  loadCachedRestaurants,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';
import { hapticMedium, hapticLight } from '@/core/haptics';

function parsePreviewParams(raw: Record<string, string | string[] | undefined>) {
  const restaurantsJson =
    typeof raw.restaurantsJson === 'string' ? raw.restaurantsJson : '';
  const voterCount = Number(raw.voterCount);
  const votesJson = typeof raw.votesJson === 'string' ? raw.votesJson : '{}';
  if (!restaurantsJson || !Number.isFinite(voterCount)) {
    return null;
  }
  let restaurants: QuickVoteRestaurant[] = [];
  try {
    restaurants = JSON.parse(restaurantsJson) as QuickVoteRestaurant[];
  } catch {
    return null;
  }
  return { restaurants, voterCount, votesJson, restaurantsJson };
}

export default function QuickVotePreviewScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const raw = useLocalSearchParams();
  const restaurantsJsonKey =
    typeof raw.restaurantsJson === 'string' ? raw.restaurantsJson : '';
  const voterCountKey = typeof raw.voterCount === 'string' ? raw.voterCount : '';
  const votesJsonKey = typeof raw.votesJson === 'string' ? raw.votesJson : '{}';
  const parsed = useMemo(
    () =>
      parsePreviewParams({
        restaurantsJson: restaurantsJsonKey,
        voterCount: voterCountKey,
        votesJson: votesJsonKey,
      }),
    [restaurantsJsonKey, voterCountKey, votesJsonKey]
  );

  const [allCached, setAllCached] = useState<QuickVoteRestaurant[] | null>(null);

  useEffect(() => {
    loadCachedRestaurants().then(setAllCached);
  }, []);

  const goVote = useCallback(() => {
    if (!parsed) return;
    hapticMedium();
    router.replace({
      pathname: '/groups/quick/vote',
      params: {
        restaurantsJson: parsed.restaurantsJson,
        voterCount: String(parsed.voterCount),
        currentVoter: '1',
        votesJson: parsed.votesJson,
      },
    });
  }, [parsed, router]);

  const reroll = useCallback(() => {
    if (!parsed) return;
    hapticLight();
    const pool = allCached ?? [];
    const next = pickQuickVoteRestaurants(pool);
    if (next.length < 5) return;
    router.replace({
      pathname: '/groups/quick/preview',
      params: {
        restaurantsJson: JSON.stringify(next),
        voterCount: String(parsed.voterCount),
        votesJson: parsed.votesJson,
      },
    });
  }, [allCached, parsed, router]);

  if (!parsed) {
    return <Redirect href="/groups/quick" />;
  }

  const { restaurants, voterCount } = parsed;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        <BackButton onPress={() => router.replace('/groups')} />
      </View>
      <Text style={[styles.header, { color: theme.text }]}>{t('quickVote.tonightsPicks')}</Text>
      <Text style={[styles.sub, { color: theme.subtext }]}>
        {t('quickVote.voterSubtitle', { count: voterCount })}
      </Text>
      {!allCached ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
      ) : null}
      <ScrollView contentContainerStyle={styles.list}>
        {restaurants.map((r) => (
          <QuickVoteRestaurantCard key={r.id} restaurant={r} theme={theme} />
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirm, { backgroundColor: theme.accent }]}
          onPress={goVote}>
          <Text style={[styles.confirmText, { color: theme.accentOnColor ?? theme.gradient[0] }]}>
            {t('quickVote.confirmBegin')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.rerollBig,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.subtext + '33',
              opacity: !allCached || allCached.length < 10 ? 0.45 : 1,
            },
          ]}
          disabled={!allCached || allCached.length < 10}
          onPress={reroll}>
          <Text style={[styles.rerollBigText, { color: theme.text }]}>{t('quickVote.rerollAll')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  header: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, marginTop: 12 },
  sub: { fontSize: 14, paddingHorizontal: 16, marginTop: 6, marginBottom: 8 },
  list: { padding: 16, paddingBottom: 200, gap: 14 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  confirm: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmText: { fontSize: 18, fontWeight: '800' },
  rerollBig: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  rerollBigText: { fontSize: 16, fontWeight: '700' },
});
