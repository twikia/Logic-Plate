import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { subscribeToSessionResponses, subscribeToSessionStatus } from '@/utils/groupRealtime';

export default function WaitingScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string; responseId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const responseId = typeof params.responseId === 'string' ? params.responseId : '';

  const [totalResponses, setTotalResponses] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!sessionId) return;
    const { count } = await supabase
      .from('group_responses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    setTotalResponses(count ?? 0);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refreshCount();
    const ch1 = subscribeToSessionResponses(sessionId, () => {
      refreshCount();
    });
    const ch2 = subscribeToSessionStatus(sessionId, (status) => {
      if (status === 'voting') {
        router.replace({ pathname: '/groups/vote', params: { sessionId, responseId } });
      }
    });
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [refreshCount, responseId, router, sessionId]);

  if (!sessionId) {
    return null;
  }

  const progress = Math.min(1, totalResponses / Math.max(2, totalResponses || 1));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.inner}>
        <Text style={[styles.check, { color: theme.accent }]}>✓ Vote in!</Text>
        <Text style={[styles.title, { color: theme.text }]}>Waiting for everyone…</Text>
        <Text style={[styles.count, { color: theme.subtext }]}>
          {totalResponses} responded
        </Text>
        <View style={[styles.progTrack, { backgroundColor: theme.cardBackground }]}>
          <View
            style={[styles.progFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]}
          />
        </View>
        <Text style={[styles.note, { color: theme.subtext }]}>
          {"The host will start the vote when everyone's ready"}
        </Text>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  check: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  count: { fontSize: 16, marginBottom: 12 },
  progTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 5 },
  note: { marginTop: 20, fontSize: 15, lineHeight: 21 },
});
