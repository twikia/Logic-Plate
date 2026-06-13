import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/BackButton';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import {
  loadCachedRestaurants,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

const MIN_VOTERS = 2;
const MAX_VOTERS = 12;
const DEFAULT_VOTER_COUNT = 3;

export default function QuickVoteSetupScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const [picks, setPicks] = useState<QuickVoteRestaurant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheError, setCacheError] = useState(false);
  const [voterCount, setVoterCount] = useState(DEFAULT_VOTER_COUNT);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setLoading(true);
        const all = await loadCachedRestaurants();
        const chosen = pickQuickVoteRestaurants(all);
        if (cancelled) return;
        if (chosen.length < 5) {
          setCacheError(true);
          setPicks(null);
        } else {
          setCacheError(false);
          setPicks(chosen);
        }
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const bumpVoters = (delta: number) => {
    setVoterCount((n) => Math.min(MAX_VOTERS, Math.max(MIN_VOTERS, n + delta)));
  };

  const start = () => {
    if (!picks || picks.length < 5) return;
    router.replace({
      pathname: '/groups/quick/preview',
      params: {
        restaurantsJson: JSON.stringify(picks),
        voterCount: String(voterCount),
        votesJson: JSON.stringify({}),
      },
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.headerRow}>
        <BackButton onPress={() => router.replace('/groups')} />
        <TopProfileButton />
      </View>
      <View style={styles.centerWrap}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: theme.text }]}>Quick Vote</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>Vote and pass the phone!</Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
          ) : cacheError ? (
            <Text style={[styles.warn, { color: theme.text }]}>
              Not enough nearby restaurants in local cache yet. Open Home or Map and wait for places to finish loading, then try again.
            </Text>
          ) : (
            <>
              <Text style={[styles.pickerLabel, { color: theme.subtext }]}>Number of voters</Text>
              <View style={styles.pickerRow}>
                <TouchableOpacity
                  style={[styles.pickerBtn, { backgroundColor: theme.cardBackground }]}
                  onPress={() => bumpVoters(-1)}
                  disabled={voterCount <= MIN_VOTERS}
                  hitSlop={8}>
                  <Text style={[styles.pickerBtnText, { color: theme.text }]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerValue, { color: theme.text }]}>{voterCount}</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { backgroundColor: theme.cardBackground }]}
                  onPress={() => bumpVoters(1)}
                  disabled={voterCount >= MAX_VOTERS}
                  hitSlop={8}>
                  <Text style={[styles.pickerBtnText, { color: theme.text }]}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: theme.accent }]}
                onPress={start}>
                <Text style={[styles.startBtnText, { color: theme.text }]}>Start voting</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  centerWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 24,
  },
  body: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 17, marginTop: 8, textAlign: 'center' },
  warn: { marginTop: 24, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  pickerLabel: { marginTop: 28, fontSize: 15, fontWeight: '600' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 12,
  },
  pickerBtn: {
    minWidth: 52,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  pickerBtnText: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
  pickerValue: { fontSize: 32, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  startBtn: {
    marginTop: 28,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  startBtnText: { fontSize: 18, fontWeight: '800' },
});
