import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { useAppTheme } from '@/context/ThemeContext';
import {
  loadCachedRestaurants,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

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

const PREVIEW_MS = 4000;

export default function QuickVotePreviewScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
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
  const advanceRef = useRef<(() => void) | null>(null);
  const didAdvance = useRef(false);

  const [allCached, setAllCached] = useState<QuickVoteRestaurant[] | null>(null);

  useEffect(() => {
    loadCachedRestaurants().then(setAllCached);
  }, []);

  const goVote = useCallback(() => {
    if (!parsed || didAdvance.current) return;
    didAdvance.current = true;
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

  advanceRef.current = goVote;

  useEffect(() => {
    if (!parsed) return;
    didAdvance.current = false;
    const t = setTimeout(() => advanceRef.current?.(), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [parsed, restaurantsJsonKey, voterCountKey, votesJsonKey]);

  const reroll = useCallback(() => {
    if (!parsed) return;
    const pool = allCached ?? [];
    const next = pickQuickVoteRestaurants(pool);
    if (next.length < 5) return;
    didAdvance.current = false;
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
        <TouchableOpacity onPress={() => router.replace('/groups')} hitSlop={12}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goVote} hitSlop={12}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Skip</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.header, { color: theme.text }]}>{"Tonight's picks"}</Text>
      <Text style={[styles.sub, { color: theme.subtext }]}>
        {voterCount} voters · starting vote in a few seconds
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
          style={[
            styles.rerollBig,
            {
              backgroundColor: theme.accent,
              opacity: !allCached || allCached.length < 10 ? 0.45 : 1,
            },
          ]}
          disabled={!allCached || allCached.length < 10}
          onPress={reroll}>
          <Text style={[styles.rerollBigText, { color: theme.text }]}>Reroll all 5</Text>
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
  list: { padding: 16, paddingBottom: 120, gap: 14 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 20,
  },
  rerollBig: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  rerollBigText: { fontSize: 18, fontWeight: '800' },
});
