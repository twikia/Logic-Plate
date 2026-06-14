import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { BackButton } from '@/components/ui/BackButton';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import {
  loadCachedRestaurants,
  pickQuickVoteRestaurants,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';
import { hapticLight, hapticMedium } from '@/core/haptics';

const MIN_VOTERS = 2;
const MAX_VOTERS = 12;
const DEFAULT_VOTER_COUNT = 3;

export default function QuickVoteSetupScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const [picks, setPicks] = useState<QuickVoteRestaurant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheError, setCacheError] = useState(false);
  const [voterCount, setVoterCount] = useState(DEFAULT_VOTER_COUNT);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setLoading(true);
        const all = await loadCachedRestaurants();
        const chosen = pickQuickVoteRestaurants(all);
        if (cancelled) return;
        if (chosen.length < 5) {
          setCacheError(true);
          setPicks(null);
        } else {
          setCacheError(false);
          setPicks(chosen);
        }
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const bumpVoters = (delta: number) => {
    hapticLight();
    setVoterCount((n) => Math.min(MAX_VOTERS, Math.max(MIN_VOTERS, n + delta)));
  };

  const start = () => {
    if (!picks || picks.length < 5) return;
    hapticMedium();
    router.replace({
      pathname: '/groups/quick/preview',
      params: {
        restaurantsJson: JSON.stringify(picks),
        voterCount: String(voterCount),
        votesJson: JSON.stringify({}),
      },
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.gradient[0] }]}>
      <TopProfileButton />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.replace('/groups')} />
        </View>
        <View style={styles.centerWrap}>
          <View style={styles.body}>
          <Text style={[styles.title, { color: theme.text }]}>{t('quickVote.title')}</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>{t('quickVote.subtitle')}</Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
          ) : cacheError ? (
            <Text style={[styles.warn, { color: theme.text }]}>
              {t('quickVote.cacheWarning')}
            </Text>
          ) : (
            <>
              <Text style={[styles.pickerLabel, { color: theme.subtext }]}>{t('quickVote.numberOfVoters')}</Text>
              <View style={styles.pickerRow}>
                <TouchableOpacity
                  style={[styles.pickerBtn, { backgroundColor: theme.cardBackground }]}
                  onPress={() => bumpVoters(-1)}
                  disabled={voterCount <= MIN_VOTERS}
                  hitSlop={8}>
                  <Text style={[styles.pickerBtnText, { color: theme.text }]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerValue, { color: theme.text }]}>{voterCount}</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { backgroundColor: theme.cardBackground }]}
                  onPress={() => bumpVoters(1)}
                  disabled={voterCount >= MAX_VOTERS}
                  hitSlop={8}>
                  <Text style={[styles.pickerBtnText, { color: theme.text }]}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: theme.accent }]}
                onPress={start}>
                <Text style={[styles.startBtnText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>
                  {t('quickVote.startVoting')}
                </Text>
              </TouchableOpacity>
            </>
          )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  centerWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 24,
  },
  body: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 17, marginTop: 8, textAlign: 'center' },
  warn: { marginTop: 24, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  pickerLabel: { marginTop: 28, fontSize: 15, fontWeight: '600' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 12,
  },
  pickerBtn: {
    minWidth: 52,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  pickerBtnText: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
  pickerValue: { fontSize: 32, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  startBtn: {
    marginTop: 28,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  startBtnText: { fontSize: 18, fontWeight: '800' },
});
