import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
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

export default function QuickVoteSetupScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const [voterCount, setVoterCount] = useState(3);
  const [picks, setPicks] = useState<QuickVoteRestaurant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheError, setCacheError] = useState(false);

  React.useEffect(() => {
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

  const start = useCallback(() => {
    if (!picks || picks.length < 5) return;
    router.push({
      pathname: '/groups/quick/vote',
      params: {
        restaurantsJson: JSON.stringify(picks),
        voterCount: String(voterCount),
        currentVoter: '1',
        votesJson: JSON.stringify({}),
      },
    });
  }, [picks, router, voterCount]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: theme.accent }]}>Back</Text>
        </TouchableOpacity>
        <TopProfileButton />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: theme.text }]}>Quick Vote</Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>Everyone votes together</Text>
        <Text style={[styles.hint, { color: theme.subtext }]}>
          Pass the phone around — takes 30 seconds
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
        ) : cacheError ? (
          <Text style={[styles.warn, { color: theme.text }]}>
            Not enough nearby restaurants loaded yet. Go back and let the map load your area first.
          </Text>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.text }]}>How many people?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: theme.cardBackground }]}
                onPress={() => setVoterCount((n) => Math.max(2, n - 1))}>
                <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.count, { color: theme.text }]}>{voterCount}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: theme.cardBackground }]}
                onPress={() => setVoterCount((n) => Math.min(10, n + 1))}>
                <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.start, { backgroundColor: theme.accent }]}
              onPress={start}>
              <Text style={[styles.startText, { color: theme.text }]}>Start →</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  sub: { fontSize: 17, marginTop: 8 },
  hint: { fontSize: 15, marginTop: 6 },
  warn: { marginTop: 24, fontSize: 16, lineHeight: 22 },
  label: { marginTop: 32, fontSize: 18, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 20,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: { fontSize: 26, fontWeight: '700' },
  count: { fontSize: 28, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  start: {
    marginTop: 40,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  startText: { fontSize: 18, fontWeight: '700' },
});
