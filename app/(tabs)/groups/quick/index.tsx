import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, []);

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
        <TouchableOpacity onPress={() => router.replace('/groups')} hitSlop={12}>
          <Text style={[styles.back, { color: theme.accent }]}>Back</Text>
        </TouchableOpacity>
        <TopProfileButton />
      </View>
      <View style={styles.centerWrap}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: theme.text }]}>Quick Vote</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>Everyone votes together</Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
          ) : cacheError ? (
            <Text style={[styles.warn, { color: theme.text }]}>
              Not enough nearby restaurants loaded yet. Go back and let the map load your area first.
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
              <Text style={[styles.pickerHint, { color: theme.subtext }]}>
                {MIN_VOTERS}–{MAX_VOTERS} people pass the phone in order.
              </Text>
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
  back: { fontSize: 17, fontWeight: '600' },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
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
  pickerHint: { marginTop: 10, fontSize: 14, textAlign: 'center' },
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
