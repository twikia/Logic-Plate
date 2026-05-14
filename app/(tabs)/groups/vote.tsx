import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { getCachedAiOverviewsForPlaces, mergeAiOverviewsOntoPlaces } from '@/core/aiOverviewCache';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { subscribeToSessionStatus, subscribeToSessionVotes } from '@/utils/groupRealtime';
import { type QuickVoteRestaurant } from '@/utils/quickVote';

type PickRow = QuickVoteRestaurant & { groupScore?: number };

export default function GroupVoteScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ sessionId?: string; responseId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const responseId = typeof params.responseId === 'string' ? params.responseId : '';

  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);

  const goWinner = useCallback(() => {
    router.replace({ pathname: '/groups/winner', params: { sessionId } });
  }, [router, sessionId]);

  const isHost = useMemo(
    () => Boolean(user?.id && hostUserId && user.id === hostUserId),
    [hostUserId, user?.id]
  );

  const loadSessionAndVotes = useCallback(async () => {
    if (!sessionId) return;
    const { data: sess } = await supabase
      .from('group_sessions')
      .select('picks, host_user_id, status')
      .eq('id', sessionId)
      .single();
    if (sess?.status === 'complete') {
      goWinner();
      return;
    }
    const rawPicks = sess?.picks;
    const list = Array.isArray(rawPicks) ? (rawPicks as PickRow[]) : [];
    const ai = await getCachedAiOverviewsForPlaces(list);
    setPicks(mergeAiOverviewsOntoPlaces(list, ai));
    setHostUserId((sess?.host_user_id as string | null) ?? null);

    const { data: votes } = await supabase
      .from('group_votes')
      .select('place_id')
      .eq('session_id', sessionId);
    const next: Record<string, number> = {};
    (votes ?? []).forEach((v: { place_id: string }) => {
      next[v.place_id] = (next[v.place_id] ?? 0) + 1;
    });
    setTallies(next);
    setLoading(false);
  }, [goWinner, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    loadSessionAndVotes();
    const chV = subscribeToSessionVotes(sessionId, (row) => {
      const pid = row.place_id as string;
      if (!pid) return;
      setTallies((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) + 1 }));
    });
    const chS = subscribeToSessionStatus(sessionId, (status) => {
      if (status === 'complete') goWinner();
    });
    return () => {
      supabase.removeChannel(chV);
      supabase.removeChannel(chS);
    };
  }, [goWinner, loadSessionAndVotes, sessionId]);

  const castVote = async (placeId: string) => {
    if (!sessionId || hasVoted) return;
    const { error } = await supabase.from('group_votes').insert({
      session_id: sessionId,
      place_id: placeId,
      voter_response_id: responseId || null,
    });
    if (error) {
      Alert.alert(
        'Vote could not be saved',
        `${error.message}${error.code ? ` (${error.code})` : ''}\n\nIf the session is not in the voting phase yet, wait until the host starts voting.`
      );
      return;
    }
    setHasVoted(true);
  };

  const endVoting = async () => {
    if (!sessionId) return;
    const { error } = await supabase.from('group_sessions').update({ status: 'complete' }).eq('id', sessionId);
    if (error) {
      Alert.alert(
        'Could not end voting',
        `${error.message}${error.code ? ` (${error.code})` : ''}`
      );
      return;
    }
    goWinner();
  };

  if (!sessionId) return null;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <Text style={[styles.header, { color: theme.text }]}>Pick your favorite</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {picks.map((r) => {
          const votes = tallies[r.id] ?? 0;
          const maxT = Math.max(...Object.values(tallies), 1);
          const barW = Math.round((votes / maxT) * 100);
          return (
            <QuickVoteRestaurantCard
              key={r.id}
              restaurant={r}
              theme={theme}
              onVote={() => void castVote(r.id)}
              belowOverview={
                <View>
                  {typeof r.groupScore === 'number' ? (
                    <Text style={[styles.match, { color: theme.accent }]}>
                      Group match {r.groupScore}
                    </Text>
                  ) : null}
                  <View style={[styles.barOuter, { backgroundColor: theme.buttonBackground }]}>
                    <View style={[styles.barInner, { width: `${barW}%`, backgroundColor: theme.accent }]} />
                  </View>
                  <Text style={[styles.votesMeta, { color: theme.subtext }]}>{votes} votes</Text>
                </View>
              }
            />
          );
        })}
      </ScrollView>
      {isHost ? (
        <TouchableOpacity
          style={[styles.hostBtn, { backgroundColor: theme.cardBackground }]}
          onPress={() => void endVoting()}>
          <Text style={[styles.hostBtnText, { color: theme.text }]}>End voting</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 20, fontWeight: '800', paddingHorizontal: 16, marginTop: 12 },
  list: { padding: 16, gap: 14, paddingBottom: 100 },
  match: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  barOuter: { height: 8, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 4 },
  votesMeta: { fontSize: 12, marginTop: 4 },
  hostBtn: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  hostBtnText: { fontWeight: '800', fontSize: 16 },
});
