import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  determineWinner,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

type Params = {
  voterName: string;
  votedRestaurantName: string;
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
    restaurantsJson,
    voterCount,
    nextVoter: Number.isFinite(nextVoter) ? nextVoter : 1,
    votesJson,
  };
}

export function QuickVoteHandoffScreen({
  params,
}: {
  params: Params;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      duration: 500,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(advance, 500);
    return () => clearTimeout(timer);
  }, [advance, progress]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Pressable style={[styles.root, { paddingTop: insets.top }]} onPress={advance}>
      <View style={styles.inner}>
        <Text style={styles.line1}>{params.voterName} picked</Text>
        <Text style={styles.restaurant}>{params.votedRestaurantName}</Text>
        <Text style={styles.pass}>
          {params.nextVoter <= params.voterCount
            ? `Pass to Voter ${params.nextVoter}`
            : 'Tallying results…'}
        </Text>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
  },
  line1: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 17,
    marginBottom: 12,
  },
  restaurant: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  pass: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    marginBottom: 32,
  },
  barTrack: {
    height: 4,
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#7dd3fc',
    borderRadius: 2,
  },
});
