import { useFocusEffect } from '@react-navigation/native';
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { QuickVoteRestaurantCard } from '@/components/QuickVoteRestaurantCard';
import { BackButton } from '@/components/ui/BackButton';
import { RestaurantImage } from '@/core/images';
import { ThemedScreenBackground } from '@/components/ui/ThemedScreenBackground';
import { useAppTheme } from '@/context/ThemeContext';
import {
  determineWinner,
  type QuickVoteRestaurant,
} from '@/utils/quickVote';
import { hapticSuccess, hapticMedium } from '@/core/haptics';
import { playSuccess } from '@/core/audioService';

export default function QuickVoteWinnerScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const raw = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const imgW = Math.min(width - 40, 400);

  const winnerJson = typeof raw.winnerJson === 'string' ? raw.winnerJson : '';
  const votesJson = typeof raw.votesJson === 'string' ? raw.votesJson : '{}';
  const restaurantsJson =
    typeof raw.restaurantsJson === 'string' ? raw.restaurantsJson : '';

  const { winner, restaurants, votes } = useMemo(() => {
    let restaurantsList: QuickVoteRestaurant[] = [];
    let votesObj: Record<string, number> = {};
    try {
      restaurantsList = JSON.parse(restaurantsJson) as QuickVoteRestaurant[];
      votesObj = JSON.parse(votesJson) as Record<string, number>;
    } catch {
      return { winner: null as QuickVoteRestaurant | null, restaurants: [], votes: {} };
    }
    const w =
      winnerJson && winnerJson.length > 0
        ? (JSON.parse(winnerJson) as QuickVoteRestaurant)
        : determineWinner(votesObj, restaurantsList);
    return { winner: w, restaurants: restaurantsList, votes: votesObj };
  }, [restaurantsJson, votesJson, winnerJson]);

  useEffect(() => {
    if (winner) {
      hapticSuccess();
      playSuccess();
    }
  }, [winner]);

  const exitToGroups = useCallback(() => {
    router.replace('/groups');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitToGroups();
        return true;
      });
      return () => sub.remove();
    }, [exitToGroups])
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const type = e.data.action.type;
      if (type === 'GO_BACK' || type === 'POP') {
        e.preventDefault();
        exitToGroups();
      }
    });
    return unsub;
  }, [exitToGroups, navigation]);

  if (!restaurants.length) {
    return <Redirect href="/groups/quick" />;
  }

  const lat = winner?.location?.latitude;
  const lng = winner?.location?.longitude;
  const openMaps = () => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      hapticSuccess();
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
    }
  };

  const breakdown = [...restaurants]
    .map((r) => ({ r, c: votes[r.id] ?? 0 }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c);

  const maxVotes = Math.max(...breakdown.map((x) => x.c), 1);

  return (
    <ThemedScreenBackground>
    <SafeAreaView style={styles.safe}>
      <View style={styles.topRow}>
        <BackButton onPress={exitToGroups} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {winner ? (
          <>
            <Text style={[styles.celebrate, { color: theme.text }]}>{t('quickVote.youreGoingHere')}</Text>
            <RestaurantImage
              restaurantId={winner.id}
              photos={(winner as { photos?: unknown[] }).photos ?? []}
              photoUrl={winner.photo_url}
              name={winner.displayName?.text ?? t('common.unknown')}
              latitude={winner.location?.latitude}
              longitude={winner.location?.longitude}
              websiteUrl={(winner as { websiteUri?: string }).websiteUri}
              formattedAddress={winner.formattedAddress}
              cuisineKey={winner.primaryType?.replace(/_restaurant$/, '')}
              width={imgW}
              height={Math.round(imgW * 0.55)}
              borderRadius={16}
            />
            <Text style={[styles.title, { color: theme.text }]}>
              {winner.displayName?.text ?? t('common.unknown')}
            </Text>
            <View style={{ marginTop: 12 }}>
              <QuickVoteRestaurantCard
                restaurant={winner}
                theme={theme}
                showThumbnail={false}
                hideTitle
              />
            </View>
          </>
        ) : (
          <Text style={[styles.celebrate, { color: theme.text }]}>{t('quickVote.votingEnded')}</Text>
        )}
        {!winner ? (
          <Text style={[styles.summary, { color: theme.subtext, textAlign: 'center' }]}>
            {t('quickVote.noVotesRecorded')}
          </Text>
        ) : null}

        <Text style={[styles.section, { color: theme.text }]}>{t('quickVote.voteBreakdown')}</Text>
        {breakdown.length === 0 ? (
          <Text style={[styles.summary, { color: theme.subtext }]}>{t('quickVote.noVotesYet')}</Text>
        ) : (
          breakdown.map((row, i) => {
            const label = row.r.displayName?.text ?? t('common.unknown');
            const w = Math.round((row.c / maxVotes) * 100);
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            return (
              <View key={row.r.id} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
                  {medal} {label}
                </Text>
                <View style={[styles.barOuter, { backgroundColor: theme.cardBackground }]}>
                  <View style={[styles.barInner, { width: `${w}%`, backgroundColor: theme.accent }]} />
                </View>
                <Text style={[styles.rowCount, { color: theme.subtext }]}>{t('common.votes', { count: row.c })}</Text>
              </View>
            );
          })
        )}

        {winner ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.accent }]}
            onPress={openMaps}>
            <Text style={[styles.btnText, { color: theme.accentOnColor ?? theme.gradient[0] }]}>
              {t('common.openInMaps')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.cardBackground }]}
          onPress={() => { hapticMedium(); router.replace('/groups/quick'); }}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('quickVote.startOver')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
    </ThemedScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  scroll: { padding: 20, paddingBottom: 48 },
  celebrate: { fontSize: 22, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginTop: 16 },
  summary: { fontSize: 15, marginTop: 8, lineHeight: 21 },
  meta: { fontSize: 14, marginTop: 10 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  row: { marginBottom: 14 },
  rowLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  barOuter: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 4 },
  rowCount: { fontSize: 12, marginTop: 4 },
  btn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700' },
});
