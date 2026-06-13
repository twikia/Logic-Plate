import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logEdgeFunctionFailureAsync } from '@/core/supabaseFunctionErrors';
import { supabase } from '@/core/supabaseClient';
import { getLocation } from '@/core/locationCache';
import { getCellsInRadius } from '@/core/h3Utils';
import { getSearchRadius } from '@/core/userSettings';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { subscribeToSessionResponses } from '@/utils/groupRealtime';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type GroupMode = 'passphone' | 'qr' | 'code';

type SessionRow = {
  id: string;
  code: string;
  status: string;
  host_user_id: string | null;
};

export default function GroupLobbyScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = (params.mode ?? 'code') as GroupMode;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [responses, setResponses] = useState<{ id: string; voter_name: string }[]>([]);
  const [reconciling, setReconciling] = useState(false);

  const appSecret = process.env.EXPO_PUBLIC_APP_SECRET ?? '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const loc = await getLocation();
      const radius = await getSearchRadius();
      const cellIds =
        loc != null ? getCellsInRadius(loc.latitude, loc.longitude, radius) : [];
      if (cellIds.length === 0) {
        setError('Location is required to start a group session.');
        setLoading(false);
        return;
      }
      if (!appSecret) {
        setError(
          'EXPO_PUBLIC_APP_SECRET is not set in this app build. It must match the APP_SECRET secret on your Supabase Edge Functions so create-group-session can authorize.'
        );
        setLoading(false);
        return;
      }
      const invokeResult = await supabase.functions.invoke('create-group-session', {
        body: {
          cellIds,
          hostUserId: user?.id ?? null,
          mode,
        },
        headers: { 'x-app-secret': appSecret },
      });
      const { data, error: fnErr } = invokeResult;
      if (cancelled) return;
      if (fnErr || !data || (data as { error?: string }).error) {
        const msg = await logEdgeFunctionFailureAsync('create-group-session', invokeResult);
        setError(msg);
        setLoading(false);
        return;
      }
      const sess = (data as { session: SessionRow }).session;
      setSession(sess);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [appSecret, mode, user?.id]);

  const sessionId = session?.id;

  const refreshResponses = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from('group_responses')
      .select('id, voter_name')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: true });
    if (data) setResponses(data as { id: string; voter_name: string }[]);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    refreshResponses();
    const ch = subscribeToSessionResponses(sessionId, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      refreshResponses();
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refreshResponses, sessionId]);

  const codeDisplay = useMemo(() => {
    if (!session?.code) return '';
    const c = session.code;
    return `${c.slice(0, 3)} ${c.slice(3)}`;
  }, [session?.code]);

  const copyCode = async () => {
    if (session?.code) await Clipboard.setStringAsync(session.code);
  };

  const shareCode = async () => {
    if (!session?.code) return;
    await Share.share({ message: `Join our Platebound vote! Code: ${session.code}` });
  };

  const addGuestHere = () => {
    if (!sessionId) return;
    router.push({
      pathname: '/groups/vibe',
      params: { sessionId, flow: 'passphone' },
    });
  };

  const answerForMyself = () => {
    if (!sessionId) return;
    router.push({
      pathname: '/groups/vibe',
      params: { sessionId, flow: 'host' },
    });
  };

  const everyoneIn = async () => {
    if (!sessionId || responses.length < 2) return;
    if (!appSecret) {
      setError(
        'EXPO_PUBLIC_APP_SECRET is not set in this app build. It must match APP_SECRET on Supabase for reconcile-group to run.'
      );
      return;
    }
    setReconciling(true);
    const invokeResult = await supabase.functions.invoke('reconcile-group', {
      body: { sessionId },
      headers: { 'x-app-secret': appSecret },
    });
    setReconciling(false);
    const { data, error: fnErr } = invokeResult;
    if (fnErr || (data as { error?: string })?.error) {
      const msg = await logEdgeFunctionFailureAsync('reconcile-group', invokeResult);
      setError(msg);
      return;
    }
    const hostResponseId =
      (await AsyncStorage.getItem(`host_response_${sessionId}`)) ?? '';
    router.replace({
      pathname: '/groups/vote',
      params: { sessionId, responseId: hostResponseId },
    });
  };

  const qrValue = session?.code
    ? `https://vote.platebound.app/vote/${session.code}`
    : '';

  const progress = Math.min(1, responses.length / Math.max(2, responses.length || 1));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : error ? (
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={[styles.err, { color: theme.text }]}>{error}</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: theme.text }]}>Share with your group</Text>

          {mode === 'qr' && qrValue ? (
            <View style={[styles.qrBox, { backgroundColor: '#fff' }]}>
              <QRCode value={qrValue} size={220} />
            </View>
          ) : null}

          {mode === 'passphone' ? (
            <TouchableOpacity
              style={[styles.addGuest, { backgroundColor: theme.accent }]}
              onPress={addGuestHere}>
              <Text style={[styles.addGuestText, { color: theme.text }]}>Add someone here</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.addGuest, { backgroundColor: theme.cardBackground }]}
            onPress={answerForMyself}>
            <Text style={[styles.addGuestText, { color: theme.text }]}>Answer for myself</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={copyCode} activeOpacity={0.8}>
            <Text style={[styles.codeLabel, { color: theme.subtext }]}>Code</Text>
            <Text style={[styles.codeBig, { color: theme.text }]}>{codeDisplay}</Text>
            <Text style={[styles.tapCopy, { color: theme.accent }]}>Tap to copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.cardBackground }]}
            onPress={shareCode}>
            <Text style={[styles.shareBtnText, { color: theme.text }]}>Share Code</Text>
          </TouchableOpacity>

          <Text style={[styles.waitingTitle, { color: theme.text }]}>Waiting for responses</Text>
          {responses.map((r) => (
            <View key={r.id} style={styles.voterRow}>
              <Text style={{ color: theme.accent }}>●</Text>
              <Text style={[styles.voterName, { color: theme.text }]}>{r.voter_name}</Text>
              <Text style={{ color: theme.accent }}>✓</Text>
            </View>
          ))}
          {responses.length === 0 ? (
            <Text style={{ color: theme.subtext }}>No responses yet.</Text>
          ) : null}

          <Text style={[styles.countLine, { color: theme.subtext }]}>
            {responses.length} response{responses.length === 1 ? '' : 's'}
          </Text>
          <View style={[styles.progTrack, { backgroundColor: theme.cardBackground }]}>
            <View
              style={[styles.progFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.everyone,
              {
                backgroundColor: responses.length >= 2 ? theme.accent : theme.cardBackground,
                opacity: responses.length >= 2 ? 1 : 0.5,
              },
            ]}
            disabled={responses.length < 2 || reconciling}
            onPress={everyoneIn}>
            {reconciling ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={[styles.everyoneText, { color: theme.text }]}>{"Everyone's in →"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topRow: { paddingHorizontal: 16, paddingTop: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { textAlign: 'center', fontSize: 16 },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  qrBox: { alignSelf: 'center', padding: 12, borderRadius: 12, marginBottom: 16 },
  addGuest: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  addGuestText: { fontSize: 17, fontWeight: '700' },
  codeLabel: { fontSize: 13, marginTop: 8 },
  codeBig: { fontSize: 36, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  tapCopy: { marginTop: 6, fontSize: 14 },
  shareBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  shareBtnText: { fontSize: 16, fontWeight: '700' },
  waitingTitle: { marginTop: 28, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  voterName: { fontSize: 16, fontWeight: '600', flex: 1 },
  countLine: { marginTop: 12, fontSize: 15 },
  progTrack: { height: 10, borderRadius: 5, marginTop: 8, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 5 },
  everyone: { marginTop: 24, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  everyoneText: { fontSize: 17, fontWeight: '800' },
});
