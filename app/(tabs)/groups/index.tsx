import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';

function normalizeJoinCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

export default function GroupsScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');

  const goLobby = (mode: 'passphone' | 'qr') => {
    router.push({ pathname: '/groups/lobby', params: { mode } });
  };

  const onJoin = async () => {
    const code = normalizeJoinCode(joinCode);
    if (code.length !== 6) {
      Alert.alert('Enter code', 'Please enter the 6-character session code.');
      return;
    }
    const { data, error } = await supabase
      .from('group_sessions')
      .select('id, status, expires_at')
      .eq('code', code)
      .maybeSingle();

    if (error || !data) {
      Alert.alert('Not found', 'No active session matches that code.');
      return;
    }
    if (data.status === 'expired') {
      Alert.alert('Expired', 'This session has expired.');
      return;
    }
    const exp = new Date(data.expires_at).getTime();
    if (exp <= Date.now()) {
      Alert.alert('Expired', 'This session has expired.');
      return;
    }
    router.push({
      pathname: '/groups/vibe',
      params: { sessionId: data.id, flow: 'join' },
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Vote together!</Text>
        <TopProfileButton />
      </View>

      <View style={styles.centerContent}>
        <View style={styles.joinSection}>
          <Text style={[styles.joinLabel, { color: theme.subtext }]}>Have a code?</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.accent + '66', backgroundColor: theme.cardBackground },
              ]}
              placeholder="Enter code"
              placeholderTextColor={theme.subtext}
              autoCapitalize="characters"
              maxLength={8}
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
              onPress={onJoin}>
              <Text style={[styles.joinBtnText, { color: theme.gradient[0] }]}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.subtext + '33' }]} />
          <Text style={[styles.dividerText, { color: theme.subtext }]}>or start one</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.subtext + '33' }]} />
        </View>

        <TouchableOpacity
          style={[
            styles.glowBtn,
            { borderColor: theme.accent + 'AA', backgroundColor: theme.cardBackground, shadowColor: theme.accent },
          ]}
          onPress={() => goLobby('qr')}>
          <Text style={styles.glowBtnEmoji}>📷</Text>
          <Text style={[styles.glowBtnText, { color: theme.text }]}>Create session</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.glowBtn,
            { borderColor: theme.accent + 'AA', backgroundColor: theme.cardBackground, shadowColor: theme.accent, marginTop: 14 },
          ]}
          onPress={() => router.push('/groups/quick')}>
          <Text style={styles.glowBtnEmoji}>⚡</Text>
          <Text style={[styles.glowBtnText, { color: theme.text }]}>Quick Vote</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  joinSection: {
    marginBottom: 4,
  },
  joinLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    letterSpacing: 2,
  },
  joinBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  joinBtnText: { fontWeight: '800', fontSize: 16 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 28,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  glowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  glowBtnEmoji: { fontSize: 24 },
  glowBtnText: { fontSize: 18, fontWeight: '700' },
});
