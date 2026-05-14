import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/context/ThemeContext';
import {
  determineWinner,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

type Params = {
  voterName: string;
  votedRestaurantName: string;
  votedPlaceId: string;
  restaurantsJson: string;
  voterCount: number;
  nextVoter: number;
  votesJson: string;
};

export function parseQuickVoteHandoffParams(
  raw: Record<string, string | string[] | undefined>
): Params | null {
  const voterName = typeof raw.voterName === 'string' ? raw.voterName : '';
  const votedRestaurantName =
    typeof raw.votedRestaurantName === 'string' ? raw.votedRestaurantName : '';
  const votedPlaceId = typeof raw.votedPlaceId === 'string' ? raw.votedPlaceId : '';
  const restaurantsJson =
    typeof raw.restaurantsJson === 'string' ? raw.restaurantsJson : '';
  const votesJson = typeof raw.votesJson === 'string' ? raw.votesJson : '';
  const voterCount = Number(raw.voterCount);
  const nextVoter = Number(raw.nextVoter);
  if (
    !voterName ||
    !votedRestaurantName.trim() ||
    !restaurantsJson ||
    votesJson === undefined ||
    !Number.isFinite(voterCount)
  ) {
    return null;
  }
  return {
    voterName,
    votedRestaurantName,
    votedPlaceId,
    restaurantsJson,
    voterCount,
    nextVoter: Number.isFinite(nextVoter) ? nextVoter : 1,
    votesJson,
  };
}

const HANDOFF_MS = 8000;

export function QuickVoteHandoffScreen({
  params,
}: {
  params: Params;
}) {
  const { theme } = useAppTheme();
  const router = useRouter();
  const progress = useRef(new Animated.Value(1)).current;
  const didAdvance = useRef(false);

  const advance = useCallback(() => {
    if (didAdvance.current) return;
    didAdvance.current = true;
    let restaurants: QuickVoteRestaurant[] = [];
    let votes: Record<string, number> = {};
    try {
      restaurants = JSON.parse(params.restaurantsJson) as QuickVoteRestaurant[];
      votes = JSON.parse(params.votesJson) as Record<string, number>;
    } catch {
      router.replace('/groups/quick');
      return;
    }

    if (params.nextVoter > params.voterCount) {
      const winner = determineWinner(votes, restaurants);
      router.replace({
        pathname: '/groups/quick/winner',
        params: {
          winnerJson: winner ? JSON.stringify(winner) : '',
          votesJson: params.votesJson,
          restaurantsJson: params.restaurantsJson,
        },
      });
    } else {
      router.replace({
        pathname: '/groups/quick/vote',
        params: {
          restaurantsJson: params.restaurantsJson,
          voterCount: String(params.voterCount),
          currentVoter: String(params.nextVoter),
          votesJson: params.votesJson,
        },
      });
    }
  }, [params, router]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: HANDOFF_MS,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(advance, HANDOFF_MS);
    return () => clearTimeout(timer);
  }, [advance, progress]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <Pressable style={styles.pressFlex} onPress={advance}>
        <ScrollView
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={[styles.line1, { color: theme.subtext }]}>{params.voterName} picked</Text>
          <Text style={[styles.restaurant, { color: theme.text }]}>{params.votedRestaurantName}</Text>
          <Text style={[styles.pass, { color: theme.subtext }]}>
            {params.nextVoter <= params.voterCount
              ? `Pass to Voter ${params.nextVoter}`
              : 'Tallying results…'}
          </Text>
          <Text style={[styles.tapHint, { color: theme.subtext }]}>Tap anywhere to continue</Text>
          <View style={[styles.barTrack, { backgroundColor: theme.subtext + '22' }]}>
            <Animated.View style={[styles.barFill, { width: barWidth, backgroundColor: theme.accent }]} />
          </View>
        </ScrollView>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pressFlex: { flex: 1 },
  scrollInner: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  line1: {
    fontSize: 17,
    marginBottom: 8,
  },
  restaurant: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  pass: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  tapHint: { fontSize: 14, marginBottom: 20 },
  barTrack: {
    height: 4,
    width: '80%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
