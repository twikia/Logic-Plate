import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { RestaurantImage } from '@/core/images';
import { formatRestaurantCostLabel } from '@/core/placePriceLabel';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { subscribeToSessionStatus } from '@/utils/groupRealtime';
import { oneLineVibe, type QuickVoteRestaurant } from '@/utils/quickVote';
import { hapticSuccess, hapticMedium } from '@/core/haptics';
import { playSuccess } from '@/core/audioService';

export default function GroupWinnerScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { formatDistance } = useDistanceFormatter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';

  const [winner, setWinner] = useState<QuickVoteRestaurant | null>(null);
  const [loading, setLoading] = useState(true);

  const imgW = Math.min(width - 40, 400);

  const resolveWinner = useCallback(async () => {
    if (!sessionId) return;
    const { data: sess } = await supabase
      .from('group_sessions')
      .select('picks, status')
      .eq('id', sessionId)
      .single();
    const picks = Array.isArray(sess?.picks) ? (sess?.picks as QuickVoteRestaurant[]) : [];
    const { data: votes } = await supabase
      .from('group_votes')
      .select('place_id')
      .eq('session_id', sessionId);
    const tallies: Record<string, number> = {};
    (votes ?? []).forEach((v: { place_id: string }) => {
      tallies[v.place_id] = (tallies[v.place_id] ?? 0) + 1;
    });
    const topId = Object.entries(tallies).sort((a, b) => b[1] - a[1])[0]?.[0];
    const w = picks.find((p) => p.id === topId) ?? picks[0] ?? null;
    setWinner(w);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    resolveWinner();
    const ch = subscribeToSessionStatus(sessionId, (status) => {
      if (status === 'complete') resolveWinner();
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [resolveWinner, sessionId]);

  useEffect(() => {
    if (winner) {
      hapticSuccess();
      playSuccess();
    }
  }, [winner]);

  const openMaps = () => {
    const lat = winner?.location?.latitude;
    const lng = winner?.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      hapticSuccess();
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
    }
  };

  const shareResult = async () => {
    if (!winner?.displayName?.text) return;
    const addr = winner.formattedAddress ?? '';
    hapticMedium();
    await Share.share({
      message: t('groupWinner.shareMessage', { name: winner.displayName.text, address: addr }),
    });
  };

  if (!sessionId) return null;

  if (loading || !winner) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.loadingText, { color: theme.subtext }]}>{t('groupWinner.tallyingVotes')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const vibe = oneLineVibe(winner);
  const price = formatRestaurantCostLabel(winner as never);
  const dist =
    typeof winner.distanceMeters === 'number'
      ? formatDistance(winner.distanceMeters)
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.celebrate, { color: theme.accent }]}>🎉</Text>
        <Text style={[styles.winTitle, { color: theme.text }]}>{t('groupWinner.youreGoingHere')}</Text>

        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
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
            width={imgW - 40}
            height={Math.round((imgW - 40) * 0.52)}
            borderRadius={14}
          />
          <Text style={[styles.name, { color: theme.text }]}>
            {winner.displayName?.text ?? t('common.unknown')}
          </Text>
          {vibe ? (
            <Text style={[styles.summary, { color: theme.subtext }]}>{vibe}</Text>
          ) : null}
          <View style={styles.pillRow}>
            {dist ? (
              <View style={[styles.pill, { backgroundColor: theme.gradient[0] }]}>
                <Text style={[styles.pillText, { color: theme.subtext }]}>📍 {dist}</Text>
              </View>
            ) : winner.formattedAddress ? (
              <View style={[styles.pill, { backgroundColor: theme.gradient[0] }]}>
                <Text style={[styles.pillText, { color: theme.subtext }]} numberOfLines={1}>
                  📍 {winner.formattedAddress}
                </Text>
              </View>
            ) : null}
            {price ? (
              <View style={[styles.pill, { backgroundColor: theme.gradient[0] }]}>
                <Text style={[styles.pillText, { color: theme.subtext }]}>💸 {price}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.accent }]}
          onPress={openMaps}>
          <Text style={[styles.btnText, { color: theme.gradient[0] }]}>{t('groupWinner.openInMaps')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.cardBackground }]}
          onPress={shareResult}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('groupWinner.shareResult')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnGhost]}
          onPress={() => { hapticMedium(); router.replace('/groups'); }}>
          <Text style={[styles.btnGhostText, { color: theme.subtext }]}>{t('groupWinner.done')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  scroll: { padding: 20, paddingBottom: 48, alignItems: 'center' },
  celebrate: { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  winTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 24 },
  card: {
    width: '100%',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    gap: 12,
  },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  summary: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  pillText: { fontSize: 13, fontWeight: '600' },
  btn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { fontSize: 16, fontWeight: '800' },
  btnGhost: { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { fontSize: 15, fontWeight: '600' },
});
