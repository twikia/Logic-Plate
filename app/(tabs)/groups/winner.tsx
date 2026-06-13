import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestaurantImage } from '@/core/images';
import { formatPlacePriceLabel } from '@/core/placePriceLabel';
import { supabase } from '@/core/supabaseClient';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { subscribeToSessionStatus } from '@/utils/groupRealtime';
import { oneLineVibe, type QuickVoteRestaurant } from '@/utils/quickVote';

export default function GroupWinnerScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
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

  const openMaps = () => {
    const lat = winner?.location?.latitude;
    const lng = winner?.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
    }
  };

  const shareResult = async () => {
    if (!winner?.displayName?.text) return;
    const addr = winner.formattedAddress ?? '';
    await Share.share({
      message: `We're going to ${winner.displayName.text}! ${addr}`,
    });
  };

  if (!sessionId) return null;

  if (loading || !winner) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.gradient[0] }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.celebrate, { color: theme.text }]}>{"You're going here 🎉"}</Text>
        <RestaurantImage
          restaurantId={winner.id}
          photos={(winner as { photos?: unknown[] }).photos ?? []}
          photoUrl={winner.photo_url}
          name={winner.displayName?.text ?? 'Restaurant'}
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
          {winner.displayName?.text ?? 'Restaurant'}
        </Text>
        <Text style={[styles.summary, { color: theme.subtext }]}>{oneLineVibe(winner)}</Text>
        <Text style={[styles.meta, { color: theme.subtext }]}>
          {typeof winner.distanceMeters === 'number'
            ? `📍 ${formatDistance(winner.distanceMeters)}`
            : winner.formattedAddress
              ? `📍 ${winner.formattedAddress}`
              : ''}
        </Text>
        {formatPlacePriceLabel(winner as never) ? (
          <Text style={[styles.meta, { color: theme.subtext }]}>
            💸 {formatPlacePriceLabel(winner as never)}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.accent }]}
          onPress={openMaps}>
          <Text style={[styles.btnText, { color: theme.text }]}>Open in Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.cardBackground }]}
          onPress={shareResult}>
          <Text style={[styles.btnText, { color: theme.text }]}>Share result</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.cardBackground }]}
          onPress={() => router.replace('/groups')}>
          <Text style={[styles.btnText, { color: theme.text }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  celebrate: { fontSize: 22, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginTop: 16 },
  summary: { fontSize: 15, marginTop: 8, lineHeight: 21 },
  meta: { fontSize: 14, marginTop: 10 },
  btn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700' },
});
