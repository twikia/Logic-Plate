import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestaurantImage } from '@/core/images';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import {
  loadCachedRestaurants,
  oneLineVibe,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

function parseVoteParams(raw: Record<string, string | string[] | undefined>) {
  const restaurantsJson =
    typeof raw.restaurantsJson === 'string' ? raw.restaurantsJson : '';
  const voterCount = Number(raw.voterCount);
  const currentVoter = Number(raw.currentVoter);
  const votesJson = typeof raw.votesJson === 'string' ? raw.votesJson : '{}';
  if (!restaurantsJson || !Number.isFinite(voterCount) || !Number.isFinite(currentVoter)) {
    return null;
  }
  let restaurants: QuickVoteRestaurant[] = [];
  let votes: Record<string, number> = {};
  try {
    restaurants = JSON.parse(restaurantsJson) as QuickVoteRestaurant[];
    votes = JSON.parse(votesJson) as Record<string, number>;
  } catch {
    return null;
  }
  return { restaurants, voterCount, currentVoter, votes, restaurantsJson, votesJson };
}

export default function QuickVoteVoteScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const raw = useLocalSearchParams();
  const parsed = parseVoteParams(raw as Record<string, string | string[] | undefined>);
  const { formatDistance } = useDistanceFormatter();
  const [allCached, setAllCached] = useState<QuickVoteRestaurant[] | null>(null);

  useEffect(() => {
    loadCachedRestaurants().then(setAllCached);
  }, []);

  const reroll = useCallback(() => {
    if (!parsed) return;
    const pool = allCached ?? [];
    const next = pickQuickVoteRestaurants(pool);
    if (next.length < 5) return;
    router.replace({
      pathname: '/groups/quick/vote',
      params: {
        restaurantsJson: JSON.stringify(next),
        voterCount: String(parsed.voterCount),
        currentVoter: '1',
        votesJson: JSON.stringify({}),
      },
    });
  }, [allCached, parsed, router]);

  const voteFor = useCallback(
    (restaurant: QuickVoteRestaurant) => {
      if (!parsed) return;
      const name = restaurant.displayName?.text ?? 'Restaurant';
      const newVotes = {
        ...parsed.votes,
        [restaurant.id]: (parsed.votes[restaurant.id] ?? 0) + 1,
      };
      router.push({
        pathname: '/groups/quick/handoff',
        params: {
          voterName: `Voter ${parsed.currentVoter}`,
          votedRestaurantName: name,
          restaurantsJson: parsed.restaurantsJson,
          voterCount: String(parsed.voterCount),
          nextVoter: String(parsed.currentVoter + 1),
          votesJson: JSON.stringify(newVotes),
        },
      });
    },
    [parsed, router]
  );

  if (!parsed) return <Redirect href="/groups/quick" />;

  const { restaurants, voterCount, currentVoter } = parsed;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={reroll} disabled={!allCached || allCached.length < 10}>
          <Text
            style={{
              color: allCached && allCached.length >= 10 ? theme.accent : theme.subtext,
              fontSize: 16,
              fontWeight: '600',
            }}>
            Reroll → 5 new
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.header, { color: theme.text }]}>
        Voter {currentVoter} of {voterCount}
      </Text>
      {!allCached ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : null}
      <ScrollView contentContainerStyle={styles.list}>
        {restaurants.map((r) => (
          <View
            key={r.id}
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '22' }]}>
            <View style={styles.cardRow}>
              <RestaurantImage
                restaurantId={r.id}
                photos={(r as { photos?: unknown[] }).photos ?? []}
                width={72}
                height={72}
                borderRadius={12}
              />
              <View style={styles.cardBody}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                  {r.displayName?.text ?? 'Restaurant'}
                </Text>
                <Text style={[styles.vibe, { color: theme.subtext }]} numberOfLines={2}>
                  {oneLineVibe(r) || ' '}
                </Text>
                <Text style={[styles.meta, { color: theme.subtext }]}>
                  {typeof r.rating === 'number' ? `⭐ ${r.rating.toFixed(1)}` : '⭐ —'}
                  {typeof r.distanceMeters === 'number'
                    ? `  •  ${formatDistance(r.distanceMeters)}`
                    : ''}
                </Text>
                <TouchableOpacity
                  style={[styles.voteBtn, { backgroundColor: theme.accent }]}
                  onPress={() => voteFor(r)}>
                  <Text style={[styles.voteBtnText, { color: theme.text }]}>Vote for this →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
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
  header: { fontSize: 20, fontWeight: '800', paddingHorizontal: 16, marginTop: 12 },
  list: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '700' },
  vibe: { fontSize: 14, marginTop: 4 },
  meta: { fontSize: 13, marginTop: 6 },
  voteBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  voteBtnText: { fontWeight: '700', fontSize: 16 },
});
