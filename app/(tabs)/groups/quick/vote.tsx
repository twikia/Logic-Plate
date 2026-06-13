import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { BackButton } from '@/components/ui/BackButton';
import { useAppTheme } from '@/context/ThemeContext';
import { type QuickVoteRestaurant } from '@/utils/quickVote';

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
  const [votedForId, setVotedForId] = useState<string | null>(null);

  const voteFor = useCallback(
    (restaurant: QuickVoteRestaurant) => {
      if (!parsed || votedForId) return;
      setVotedForId(restaurant.id);
      const name = restaurant.displayName?.text ?? 'Restaurant';
      const newVotes = {
        ...parsed.votes,
        [restaurant.id]: (parsed.votes[restaurant.id] ?? 0) + 1,
      };
      setTimeout(() => {
        router.push({
          pathname: '/groups/quick/handoff',
          params: {
            voterName: `Voter ${parsed.currentVoter}`,
            votedRestaurantName: name,
            votedPlaceId: restaurant.id,
            restaurantsJson: parsed.restaurantsJson,
            voterCount: String(parsed.voterCount),
            nextVoter: String(parsed.currentVoter + 1),
            votesJson: JSON.stringify(newVotes),
          },
        });
      }, 400);
    },
    [parsed, router, votedForId]
  );

  const endVoting = useCallback(() => {
    if (!parsed) return;
    let votesJson = parsed.votesJson;
    if (votedForId) {
      const newVotes = {
        ...parsed.votes,
        [votedForId]: (parsed.votes[votedForId] ?? 0) + 1,
      };
      votesJson = JSON.stringify(newVotes);
    }
    router.replace({
      pathname: '/groups/quick/winner',
      params: {
        winnerJson: '',
        votesJson,
        restaurantsJson: parsed.restaurantsJson,
      },
    });
  }, [parsed, router, votedForId]);

  const hasAnyVote = useMemo(() => {
    if (!parsed) return false;
    if (votedForId) return true;
    return Object.values(parsed.votes).some((count) => count > 0);
  }, [parsed, votedForId]);

  const handleBack = useCallback(() => {
    if (hasAnyVote) {
      endVoting();
    } else {
      router.replace('/groups');
    }
  }, [endVoting, hasAnyVote, router]);

  if (!parsed) return <Redirect href="/groups/quick" />;

  const { restaurants, voterCount, currentVoter } = parsed;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        <BackButton onPress={handleBack} />
        <View style={styles.voterBadge}>
          <Text style={[styles.voterText, { color: theme.accent }]}>
            Voter {currentVoter} / {voterCount}
          </Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <Text style={[styles.header, { color: theme.text }]}>Pick your favorite</Text>
      <Text style={[styles.hint, { color: theme.subtext }]}>
        Tap a card to expand, tap the box to vote
      </Text>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {restaurants.map((r) => (
          <QuickVoteRestaurantCard
            key={r.id}
            restaurant={r}
            theme={theme}
            onVote={() => voteFor(r)}
            voted={votedForId === r.id}
          />
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  topSpacer: { width: 40 },
  voterBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  voterText: { fontSize: 14, fontWeight: '700' },
  header: { fontSize: 22, fontWeight: '800', paddingHorizontal: 20, marginTop: 4 },
  hint: { fontSize: 13, paddingHorizontal: 20, marginTop: 3, marginBottom: 12 },
  list: { paddingHorizontal: 16, gap: 12, paddingBottom: 40 },
});
