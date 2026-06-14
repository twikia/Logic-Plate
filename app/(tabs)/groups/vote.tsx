import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { BackButton } from '@/components/ui/BackButton';
import { getCachedAiOverviewsForPlaces, mergeAiOverviewsOntoPlaces } from '@/core/aiOverviewCache';
import { clearHostSessionId, onHostSessionEndRequest } from '@/core/groupSessionState';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { subscribeToSessionStatus, subscribeToSessionVotes } from '@/utils/groupRealtime';
import { type QuickVoteRestaurant } from '@/utils/quickVote';

type PickRow = QuickVoteRestaurant & { groupScore?: number };

export default function GroupVoteScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ sessionId?: string; responseId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const responseId = typeof params.responseId === 'string' ? params.responseId : '';

  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const hasAutoEnded = useRef(false);
  const normalExit = useRef(false);

  const goWinner = useCallback(() => {
    normalExit.current = true;
    void clearHostSessionId();
    router.replace({ pathname: '/groups/winner', params: { sessionId } });
  }, [router, sessionId]);

  useEffect(() => {
    return onHostSessionEndRequest(() => {
      normalExit.current = true;
    });
  }, []);

  const isHost = useMemo(
    () => Boolean(user?.id && hostUserId && user.id === hostUserId),
    [hostUserId, user?.id]
  );

  const endVoting = useCallback(async () => {
    if (!sessionId) return;
    const { error } = await supabase
      .from('group_sessions')
      .update({ status: 'complete' })
      .eq('id', sessionId);
    if (error) {
      Alert.alert(
        'Could not end voting',
        `${error.message}${error.code ? ` (${error.code})` : ''}`
      );
      return;
    }
    goWinner();
  }, [goWinner, sessionId]);

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

    const { count } = await supabase
      .from('group_responses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    setResponseCount(count ?? 0);

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
      if (status === 'expired') setSessionEnded(true);
    });
    return () => {
      supabase.removeChannel(chV);
      supabase.removeChannel(chS);
    };
  }, [goWinner, loadSessionAndVotes, router, sessionId]);

  const totalVotesCast = useMemo(
    () => Object.values(tallies).reduce((a, b) => a + b, 0),
    [tallies]
  );

  useEffect(() => {
    if (
      !hasAutoEnded.current &&
      responseCount > 0 &&
      totalVotesCast >= responseCount
    ) {
      hasAutoEnded.current = true;
      void endVoting();
    }
  }, [endVoting, responseCount, totalVotesCast]);

  useEffect(() => {
    if (!isHost) return;
    const unsub = navigation.addListener('beforeRemove', () => {
      if (!normalExit.current && sessionId) {
        void supabase.from('group_sessions').update({ status: 'expired' }).eq('id', sessionId);
      }
    });
    return unsub;
  }, [isHost, navigation, sessionId]);

  useEffect(() => {
    if (!isHost) return;
    const sub = AppState.addEventListener('change', (next) => {
      if ((next === 'background' || next === 'inactive') && !normalExit.current && sessionId) {
        void supabase.from('group_sessions').update({ status: 'expired' }).eq('id', sessionId);
      }
    });
    return () => sub.remove();
  }, [isHost, sessionId]);

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
    setVotedForId(placeId);
  };

  if (!sessionId) return null;

  if (sessionEnded) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <View style={styles.center}>
          <Text style={[styles.endedIcon, { color: theme.subtext }]}>🔒</Text>
          <Text style={[styles.endedTitle, { color: theme.text }]}>Session Ended</Text>
          <Text style={[styles.endedSub, { color: theme.subtext }]}>The host ended this session.</Text>
          <TouchableOpacity
            style={[styles.endedBtn, { backgroundColor: theme.accent }]}
            onPress={() => router.replace('/groups')}>
            <Text style={[styles.endedBtnText, { color: theme.gradient[0] }]}>Back to Groups</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={[styles.loadingText, { color: theme.subtext }]}>Loading restaurants…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        {isHost ? (
          <View style={styles.topSpacer} />
        ) : (
          <BackButton variant="circle" onPress={() => router.replace('/groups')} />
        )}
        <View style={styles.topTitles}>
          <Text style={[styles.header, { color: theme.text }]}>Pick your favorite</Text>
          <Text style={[styles.subHeader, { color: theme.subtext }]}>
            {hasVoted ? 'Your vote is in ✓' : 'Tap a card to expand, then vote →'}
          </Text>
        </View>
        {isHost ? (
          <TouchableOpacity
            style={[styles.endBtn, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '44' }]}
            onPress={() => void endVoting()}>
            <Text style={[styles.endBtnText, { color: theme.subtext }]}>End</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {picks.map((r) => {
          const votes = tallies[r.id] ?? 0;
          const maxT = Math.max(...Object.values(tallies), 1);
          const barW = Math.round((votes / maxT) * 100);
          return (
            <QuickVoteRestaurantCard
              key={r.id}
              restaurant={r}
              theme={theme}
              onVote={hasVoted ? undefined : () => void castVote(r.id)}
              voted={votedForId === r.id}
              belowOverview={
                <View style={styles.voteMeta}>
                  {typeof r.groupScore === 'number' ? (
                    <Text style={[styles.match, { color: theme.accent }]}>
                      Group match {r.groupScore}
                    </Text>
                  ) : null}
                  <View style={[styles.barOuter, { backgroundColor: theme.gradient[0] }]}>
                    <View
                      style={[styles.barInner, { width: `${barW}%`, backgroundColor: theme.accent }]}
                    />
                  </View>
                  <Text style={[styles.votesMeta, { color: theme.subtext }]}>
                    {votes} {votes === 1 ? 'vote' : 'votes'}
                  </Text>
                </View>
              }
            />
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  topTitles: { flex: 1, minWidth: 0 },
  topSpacer: { width: 40 },
  header: { fontSize: 22, fontWeight: '800' },
  subHeader: { fontSize: 13, marginTop: 3 },
  endBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  endBtnText: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  voteMeta: { marginTop: 10 },
  match: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  barOuter: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 3 },
  votesMeta: { fontSize: 12, marginTop: 5 },
  endedIcon: { fontSize: 48, marginBottom: 16 },
  endedTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  endedSub: { fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  endedBtn: { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 16 },
  endedBtnText: { fontSize: 16, fontWeight: '800' },
});
