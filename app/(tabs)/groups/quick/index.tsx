import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import {
  loadCachedRestaurants,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';

const DEFAULT_VOTER_COUNT = 3;

export default function QuickVoteSetupScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const [picks, setPicks] = useState<QuickVoteRestaurant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheError, setCacheError] = useState(false);

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

  const start = () => {
    if (!picks || picks.length < 5) return;
    router.replace({
      pathname: '/groups/quick/preview',
      params: {
        restaurantsJson: JSON.stringify(picks),
        voterCount: String(DEFAULT_VOTER_COUNT),
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
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: theme.accent }]}
            onPress={start}>
            <Text style={[styles.startBtnText, { color: theme.text }]}>Start voting</Text>
          </TouchableOpacity>
        )}
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
  body: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  sub: { fontSize: 17, marginTop: 8 },
  warn: { marginTop: 24, fontSize: 16, lineHeight: 22 },
  startBtn: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  startBtnText: { fontSize: 18, fontWeight: '800' },
});
