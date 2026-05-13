import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
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
          votedPlaceId: restaurant.id,
          restaurantsJson: parsed.restaurantsJson,
          voterCount: String(parsed.voterCount),
          nextVoter: String(parsed.currentVoter + 1),
          votesJson: JSON.stringify(newVotes),
        },
      });
    },
    [parsed, router]
  );

  const endVoting = useCallback(() => {
    if (!parsed) return;
    router.replace({
      pathname: '/groups/quick/winner',
      params: {
        winnerJson: '',
        votesJson: parsed.votesJson,
        restaurantsJson: parsed.restaurantsJson,
      },
    });
  }, [parsed, router]);

  if (!parsed) return <Redirect href="/groups/quick" />;

  const { restaurants, voterCount, currentVoter } = parsed;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.replace('/groups')} hitSlop={12}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={endVoting} hitSlop={12}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>End</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.header, { color: theme.text }]}>
        Voter {currentVoter} of {voterCount}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {restaurants.map((r) => (
          <QuickVoteRestaurantCard
            key={r.id}
            restaurant={r}
            theme={theme}
            onVote={() => voteFor(r)}
          />
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
});
