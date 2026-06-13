import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const [sessionEnded, setSessionEnded] = useState(false);

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
      if (status === 'expired') {
        setSessionEnded(true);
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

  if (sessionEnded) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <View style={styles.inner}>
          <Text style={[styles.endedIcon, { color: theme.subtext }]}>🔒</Text>
          <Text style={[styles.title, { color: theme.text }]}>Session Ended</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            The host ended this session.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: theme.accent }]}
            onPress={() => router.replace('/groups')}>
            <Text style={[styles.backBtnText, { color: theme.gradient[0] }]}>Back to Groups</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.inner}>
        <View style={[styles.checkCircle, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '44' }]}>
          <Text style={[styles.checkIcon, { color: theme.accent }]}>✓</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>You're in!</Text>
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          Your preferences have been saved
        </Text>

        <View style={[styles.countBox, { backgroundColor: theme.cardBackground }]}>
          <Text style={[styles.countNum, { color: theme.accent }]}>{totalResponses}</Text>
          <Text style={[styles.countLabel, { color: theme.subtext }]}>
            {totalResponses === 1 ? 'person ready' : 'people ready'}
          </Text>
        </View>

        <View style={[styles.progTrack, { backgroundColor: theme.cardBackground }]}>
          <View
            style={[
              styles.progFill,
              {
                width: totalResponses >= 2 ? '100%' : `${(totalResponses / 2) * 100}%`,
                backgroundColor: theme.accent,
              },
            ]}
          />
        </View>

        <Text style={[styles.note, { color: theme.subtext }]}>
          {"Waiting for the host to start the vote…"}
        </Text>

        <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} size="large" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center' },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  checkIcon: { fontSize: 36, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 28 },
  countBox: {
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  countNum: { fontSize: 40, fontWeight: '800' },
  countLabel: { fontSize: 14, marginTop: 4 },
  progTrack: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%', marginBottom: 16 },
  progFill: { height: '100%', borderRadius: 3 },
  note: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  endedIcon: { fontSize: 48, marginBottom: 16 },
  backBtn: { marginTop: 32, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 16 },
  backBtnText: { fontSize: 16, fontWeight: '800' },
});
