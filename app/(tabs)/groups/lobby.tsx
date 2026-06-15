import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  ActivityIndicator,
  AppState,
  LayoutAnimation,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearHostSessionId,
  onHostSessionEndRequest,
  setHostSessionId,
} from '@/core/groupSessionState';
import { logEdgeFunctionFailureAsync } from '@/core/supabaseFunctionErrors';
import { supabase } from '@/core/supabaseClient';
import { getLocation } from '@/core/locationCache';
import { getCellsInRadius } from '@/core/h3Utils';
import { getSearchRadius } from '@/core/userSettings';
import { readCacheBulk } from '@/core/cacheManager';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { BackButton } from '@/components/ui/BackButton';
import { ThemedScreenBackground } from '@/components/ui/ThemedScreenBackground';
import { subscribeToSessionResponses } from '@/utils/groupRealtime';

type GroupMode = 'passphone' | 'qr' | 'code';

type SessionRow = {
  id: string;
  code: string;
  status: string;
  host_user_id: string | null;
  expires_at?: string;
};

export default function GroupLobbyScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = (params.mode ?? 'code') as GroupMode;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [responses, setResponses] = useState<{ id: string; voter_name: string }[]>([]);
  const [reconciling, setReconciling] = useState(false);

  const normalExit = useRef(false);
  const sessionRef = useRef<SessionRow | null>(null);
  const cellIdsRef = useRef<string[]>([]);

  const appSecret = process.env.EXPO_PUBLIC_APP_SECRET ?? '';

  const endSession = useCallback(async (id: string) => {
    await supabase.from('group_sessions').update({ status: 'expired' }).eq('id', id);
    await clearHostSessionId();
  }, []);

  useEffect(() => {
    return onHostSessionEndRequest(() => {
      normalExit.current = true;
    });
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const loc = await getLocation();
      const radius = await getSearchRadius();
      const cellIds =
        loc != null ? getCellsInRadius(loc.latitude, loc.longitude, radius) : [];
      cellIdsRef.current = cellIds;
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
      await setHostSessionId(sess.id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [appSecret, mode, user?.id]);

  useEffect(() => {
    if (!session?.expires_at) return;
    const ms = new Date(session.expires_at).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      if (!normalExit.current && sessionRef.current?.id) {
        void endSession(sessionRef.current.id);
        setError('Session timed out.');
      }
    }, ms);
    return () => clearTimeout(t);
  }, [endSession, session?.expires_at]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if ((next === 'background' || next === 'inactive') && !normalExit.current) {
        const id = sessionRef.current?.id;
        if (id) void endSession(id);
      }
    });
    return () => sub.remove();
  }, [endSession]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (!normalExit.current) {
        const id = sessionRef.current?.id;
        if (id) void endSession(id);
      }
    });
    return unsub;
  }, [endSession, navigation]);

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
    let localRestaurantCache: { cellId: string; restaurants: unknown[] }[] = [];
    const storedCellIds = cellIdsRef.current;
    if (storedCellIds.length > 0) {
      try {
        const { hits } = await readCacheBulk(storedCellIds);
        localRestaurantCache = Array.from(hits.entries()).map(([cellId, restaurants]) => ({
          cellId,
          restaurants,
        }));
      } catch {
        // Non-fatal: reconcile-group will fall back to Supabase restaurant_cache
      }
    }
    setReconciling(true);
    const invokeResult = await supabase.functions.invoke('reconcile-group', {
      body: { sessionId, localRestaurantCache },
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
    normalExit.current = true;
    router.replace({
      pathname: '/groups/vote',
      params: { sessionId, responseId: hostResponseId },
    });
  };

  const voteBaseUrl = (process.env.EXPO_PUBLIC_VOTE_BASE_URL ?? 'https://platebound.vercel.app').replace(
    /\/$/,
    ''
  );
  const qrValue = session?.code ? `${voteBaseUrl}/vote/${session.code}` : '';

  return (
    <ThemedScreenBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.topRow}>
        <BackButton
          onPress={() => {
            normalExit.current = true;
            const id = sessionRef.current?.id;
            if (id) void endSession(id);
            router.back();
          }}
        />
        <Text style={[styles.topTitle, { color: theme.text }]}>New Session</Text>
        {!loading && !error ? (
          <TouchableOpacity
            onPress={everyoneIn}
            disabled={responses.length < 2 || reconciling}
            hitSlop={8}
            style={[
              styles.startHeaderBtn,
              {
                borderColor: responses.length >= 2 ? theme.accent : theme.subtext + '44',
                backgroundColor: theme.cardBackground,
                opacity: responses.length >= 2 && !reconciling ? 1 : 0.5,
              },
            ]}>
            {reconciling ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Text
                style={[
                  styles.startHeaderText,
                  { color: responses.length >= 2 ? theme.accent : theme.subtext },
                ]}>
                Start
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.startHeaderSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.subtext }]}>Creating session…</Text>
        </View>
      ) : error ? (
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={[styles.err, { color: theme.text }]}>{error}</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>Invite your group</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            Share the code or QR so everyone can join
          </Text>

          <TouchableOpacity
            style={[styles.codeBlock, { backgroundColor: theme.cardBackground, borderColor: theme.accent + '44' }]}
            onPress={copyCode}
            activeOpacity={0.8}>
            <Text style={[styles.codeSmall, { color: theme.subtext }]}>SESSION CODE</Text>
            <Text style={[styles.codeBig, { color: theme.accent }]}>{codeDisplay}</Text>
            <Text style={[styles.tapCopy, { color: theme.subtext }]}>Tap to copy</Text>
          </TouchableOpacity>

          {mode === 'qr' && qrValue ? (
            <View style={[styles.qrBox, { backgroundColor: '#fff' }]}>
              <QRCode value={qrValue} size={200} />
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {mode === 'passphone' ? (
              <TouchableOpacity
                style={[styles.halfBtn, { backgroundColor: theme.accent }]}
                onPress={addGuestHere}>
                <Text style={[styles.halfBtnText, { color: theme.gradient[0] }]}>Pass phone</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.halfBtn,
                { backgroundColor: theme.cardBackground, borderColor: theme.accent + '55', borderWidth: 1.5 },
                mode !== 'passphone' && { flex: 1 },
              ]}
              onPress={answerForMyself}>
              <Text style={[styles.halfBtnText, { color: theme.accent }]}>Answer for myself</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.halfBtn, { backgroundColor: theme.cardBackground, borderColor: theme.subtext + '33', borderWidth: 1.5 }]}
              onPress={shareCode}>
              <Text style={[styles.halfBtnText, { color: theme.text }]}>Share link</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.responsesBox, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.waitingTitle, { color: theme.text }]}>
              Responses
              <Text style={[styles.responseCount, { color: theme.accent }]}>
                {' '}{responses.length}
              </Text>
              <Text style={[styles.minNoteInline, { color: theme.subtext }]}>
                {' · '}
                {responses.length < 2
                  ? `Need ${2 - responses.length} more to start`
                  : 'Ready to go!'}
              </Text>
            </Text>
            {responses.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.subtext }]}>
                Waiting for the first response…
              </Text>
            ) : null}
            {responses.map((r) => (
              <View key={r.id} style={styles.voterRow}>
                <View style={[styles.voterDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.voterName, { color: theme.text }]}>{r.voter_name}</Text>
                <Text style={{ color: theme.accent, fontSize: 14 }}>✓</Text>
              </View>
            ))}
            <View style={[styles.progTrack, { backgroundColor: theme.gradient[0] }]}>
              <View
                style={[
                  styles.progFill,
                  {
                    width: responses.length >= 2 ? '100%' : `${(responses.length / 2) * 100}%`,
                    backgroundColor: theme.accent,
                  },
                ]}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
    </ThemedScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  topTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  startHeaderBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    height: 38,
  },
  startHeaderSpacer: { width: 64 },
  startHeaderText: { fontSize: 15, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  loadingText: { fontSize: 15 },
  err: { textAlign: 'center', fontSize: 16 },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 24 },
  codeBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  codeSmall: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  codeBig: { fontSize: 44, fontWeight: '800', letterSpacing: 6, marginVertical: 8 },
  tapCopy: { fontSize: 13 },
  qrBox: { alignSelf: 'center', padding: 16, borderRadius: 16, marginBottom: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  halfBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfBtnText: { fontSize: 14, fontWeight: '700' },
  responsesBox: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
  waitingTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  responseCount: { fontSize: 17, fontWeight: '800' },
  emptyText: { fontSize: 14, marginBottom: 12 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0 },
  voterDot: { width: 8, height: 8, borderRadius: 4 },
  voterName: { fontSize: 15, fontWeight: '600', flex: 1 },
  progTrack: { height: 6, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 3 },
  minNoteInline: { fontSize: 13, fontWeight: '500' },
});
