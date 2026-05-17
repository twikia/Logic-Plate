import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.joinRow}>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.subtext + '44', backgroundColor: theme.cardBackground },
            ]}
            placeholder="Enter code"
            placeholderTextColor={theme.subtext}
            autoCapitalize="characters"
            maxLength={8}
            value={joinCode}
            onChangeText={setJoinCode}
          />
          <TouchableOpacity
            style={[styles.joinBtn, { backgroundColor: theme.accent }]}
            onPress={onJoin}>
            <Text style={[styles.joinBtnText, { color: theme.text }]}>Join</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.modeBtn, { backgroundColor: theme.cardBackground }]}
          onPress={() => goLobby('qr')}>
          <Text style={[styles.modeEmoji]}>📷</Text>
          <Text style={[styles.modeText, { color: theme.text }]}>Create session</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeBtn, { backgroundColor: theme.cardBackground, marginTop: 8 }]}
          onPress={() => router.push('/groups/quick')}>
          <Text style={[styles.modeEmoji]}>⚡</Text>
          <Text style={[styles.modeText, { color: theme.text }]}>Quick Vote</Text>
        </TouchableOpacity>
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
  headerTitle: { fontSize: 22, fontWeight: '800' },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  modeEmoji: { fontSize: 22 },
  modeText: { fontSize: 18, fontWeight: '700' },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
  },
  joinBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 },
  joinBtnText: { fontWeight: '800', fontSize: 16 },
});
