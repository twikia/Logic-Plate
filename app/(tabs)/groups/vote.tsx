import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { subscribeToSessionStatus, subscribeToSessionVotes } from '@/utils/groupRealtime';
import { oneLineVibe, type QuickVoteRestaurant } from '@/utils/quickVote';

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
  const [expectedVotes, setExpectedVotes] = useState(0);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const autoCompletedRef = useRef(false);

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
    setPicks(list);
    setHostUserId((sess?.host_user_id as string | null) ?? null);

    const { count } = await supabase
      .from('group_responses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    setExpectedVotes(count ?? 0);

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

  const totalVotesCast = useMemo(() => Object.values(tallies).reduce((a, b) => a + b, 0), [tallies]);

  useEffect(() => {
    if (expectedVotes > 0 && totalVotesCast >= expectedVotes && !autoCompletedRef.current) {
      autoCompletedRef.current = true;
      void supabase.from('group_sessions').update({ status: 'complete' }).eq('id', sessionId);
    }
  }, [expectedVotes, sessionId, totalVotesCast]);

  const castVote = async (placeId: string) => {
    if (!sessionId || hasVoted) return;
    const { error } = await supabase.from('group_votes').insert({
      session_id: sessionId,
      place_id: placeId,
      voter_response_id: responseId || null,
    });
    if (!error) setHasVoted(true);
  };

  const seeResults = async () => {
    if (!sessionId) return;
    await supabase.from('group_sessions').update({ status: 'complete' }).eq('id', sessionId);
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
            <View
              key={r.id}
              style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '22' }]}>
              <View style={styles.row}>
                <RestaurantImage
                  restaurantId={r.id}
                  photos={(r as { photos?: unknown[] }).photos ?? []}
                  width={72}
                  height={72}
                  borderRadius={12}
                />
                <View style={styles.body}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                    {r.displayName?.text ?? 'Restaurant'}
                  </Text>
                  <Text style={[styles.vibe, { color: theme.subtext }]} numberOfLines={2}>
                    {oneLineVibe(r)}
                  </Text>
                  {typeof r.groupScore === 'number' ? (
                    <Text style={[styles.match, { color: theme.accent }]}>
                      Group match {r.groupScore}
                    </Text>
                  ) : null}
                  <View style={[styles.barOuter, { backgroundColor: theme.buttonBackground }]}>
                    <View style={[styles.barInner, { width: `${barW}%`, backgroundColor: theme.accent }]} />
                  </View>
                  <Text style={[styles.votesMeta, { color: theme.subtext }]}>{votes} votes</Text>
                  <TouchableOpacity
                    style={[
                      styles.voteBtn,
                      { backgroundColor: hasVoted ? theme.cardBackground : theme.accent },
                    ]}
                    disabled={hasVoted}
                    onPress={() => void castVote(r.id)}>
                    <Text style={[styles.voteBtnText, { color: theme.text }]}>Vote for this →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {isHost ? (
        <TouchableOpacity
          style={[styles.hostBtn, { backgroundColor: theme.cardBackground }]}
          onPress={() => void seeResults()}>
          <Text style={[styles.hostBtnText, { color: theme.text }]}>See results</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { fontSize: 20, fontWeight: '800', paddingHorizontal: 16, marginTop: 12 },
  list: { padding: 16, gap: 14, paddingBottom: 100 },
  card: { borderRadius: 16, padding: 14, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '700' },
  vibe: { fontSize: 14, marginTop: 4 },
  match: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  barOuter: { height: 8, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 4 },
  votesMeta: { fontSize: 12, marginTop: 4 },
  voteBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  voteBtnText: { fontWeight: '700', fontSize: 15 },
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
