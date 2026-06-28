import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { NeonGradientTitle } from '@/components/NeonGradientTitle';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { hapticMedium, hapticError, hapticSuccess } from '@/core/haptics';

const { width: SCREEN_W } = Dimensions.get('window');

function normalizeJoinCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

export default function GroupsScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const [joinCode, setJoinCode] = useState('');

  const goLobby = (mode: 'passphone' | 'qr') => {
    hapticMedium();
    router.push({ pathname: '/groups/lobby', params: { mode } });
  };

  const onJoin = async () => {
    const code = normalizeJoinCode(joinCode);
    if (code.length !== 6) {
      hapticError();
      Alert.alert(t('groups.alertEnterCodeTitle'), t('groups.alertEnterCodeMsg'));
      return;
    }
    hapticMedium();
    const { data, error } = await supabase
      .from('group_sessions')
      .select('id, status, expires_at')
      .eq('code', code)
      .maybeSingle();

    if (error || !data) {
      hapticError();
      Alert.alert(t('groups.alertNotFoundTitle'), t('groups.alertNotFoundMsg'));
      return;
    }
    if (data.status === 'expired') {
      hapticError();
      Alert.alert(t('groups.alertExpiredTitle'), t('groups.alertExpiredMsg'));
      return;
    }
    const exp = new Date(data.expires_at).getTime();
    if (exp <= Date.now()) {
      hapticError();
      Alert.alert(t('groups.alertExpiredTitle'), t('groups.alertExpiredMsg'));
      return;
    }
    hapticSuccess();
    router.push({
      pathname: '/groups/vibe',
      params: { sessionId: data.id, flow: 'join' },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.screenBackground ?? '#000000' }]}>
      <TopProfileButton />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.joinSection}>
            {theme.neonColors ? (
              <NeonGradientTitle
                text={t('groups.title')}
                width={SCREEN_W - 48}
                fontSize={26}
                style={{ marginBottom: 10 }}
              />
            ) : (
              <Text style={[styles.headerTitle, { color: theme.text }]}>{t('groups.title')}</Text>
            )}
            <Text style={[styles.joinLabel, { color: theme.subtext }]}>{t('groups.haveCode')}</Text>
            <View style={styles.joinRow}>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.accent + '66', backgroundColor: theme.cardBackground },
              ]}
              placeholder={t('groups.enterCodePlaceholder')}
              placeholderTextColor={theme.subtext}
              autoCapitalize="characters"
              maxLength={8}
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
              onPress={onJoin}>
              <Text style={[styles.joinBtnText, { color: theme.gradient[0] }]}>{t('groups.join')}</Text>
            </TouchableOpacity>
            </View>
          </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.subtext + '33' }]} />
          <Text style={[styles.dividerText, { color: theme.subtext }]}>{t('groups.orStartOne')}</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.subtext + '33' }]} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(160).springify()}>
          <TouchableOpacity
            style={[
              styles.glowBtn,
              { borderColor: theme.accent + 'AA', backgroundColor: theme.cardBackground, shadowColor: theme.accent },
            ]}
            onPress={() => goLobby('qr')}>
            <Text style={styles.glowBtnEmoji}>📷</Text>
            <Text style={[styles.glowBtnText, { color: theme.text }]}>{t('groups.createSession')}</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(240).springify()}>
          <TouchableOpacity
            style={[
              styles.glowBtn,
              { borderColor: theme.accent + 'AA', backgroundColor: theme.cardBackground, shadowColor: theme.accent, marginTop: 14 },
            ]}
            onPress={() => { hapticMedium(); router.push('/groups/quick'); }}>
            <Text style={styles.glowBtnEmoji}>⚡</Text>
            <Text style={[styles.glowBtnText, { color: theme.text }]}>{t('groups.quickVote')}</Text>
          </TouchableOpacity>
        </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  joinSection: {
    marginBottom: 4,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  joinLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    alignSelf: 'stretch',
  },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center', alignSelf: 'stretch' },
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
