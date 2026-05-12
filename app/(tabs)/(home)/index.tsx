import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage } from '../../../core/images';
import { isOpenNow } from '../../../core/isOpenNow';
import { getLocation } from '../../../core/locationCache';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '../../../core/restaurantOrchestrator';
import { getSearchRadius } from '../../../core/userSettings';

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function openMaps(name: string, lat: number, lng: number) {
  const encoded = encodeURIComponent(name);
  if (Platform.OS === 'ios') {
    Linking.openURL(`maps:0,0?q=${encoded}&ll=${lat},${lng}`).catch(() =>
      Linking.openURL(`https://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`)
    );
  } else {
    Linking.openURL(`geo:${lat},${lng}?q=${encoded}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
    );
  }
}

function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number | undefined;
  max: number;
}) {
  const pending = value === undefined || !Number.isFinite(value);
  const safe = pending ? 0 : value;
  const pct = pending ? 0 : Math.max(0, Math.min(1, safe / max));
  return (
    <View style={styles.scoreItem}>
      <View style={styles.scoreLabelRow}>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.scoreValue}>
          {pending ? '-' : `${safe.toFixed(max === 10 ? 1 : 0)}/${max}`}
        </Text>
      </View>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

function StarScore({ label, value }: { label: string; value: number | undefined }) {
  const pending = value === undefined || !Number.isFinite(value);
  const rounded = pending ? 0 : Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View style={styles.starWrap}>
      <Text style={styles.scoreLabel}>{label}</Text>
      {pending ? (
        <Text style={[styles.scoreLabel, { marginTop: 2 }]}>-</Text>
      ) : (
        <View style={styles.starRow}>
          {Array.from({ length: 5 }, (_, i) => (
            <Ionicons
              key={`${label}_${i}`}
              name={i < rounded ? 'star' : 'star-outline'}
              size={12}
              color="#FFD66B"
            />
          ))}
        </View>
      )}
    </View>
  );
}

function DailySpotlightCard({
  place,
  onPress,
  onOpenMap,
}: {
  place: any;
  onPress: () => void;
  onOpenMap: () => void;
}) {
  const name = place.displayName?.text || 'Unknown';
  const ai = place.aiOverview;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.spotlightCard} onPress={onPress}>
      <Text style={styles.spotlightBadge}>{'Today\u2019s pick'}</Text>
      <View style={styles.spotlightTop}>
        <View style={styles.spotlightThumbWrap}>
          <RestaurantImage
            restaurantId={place.id}
            photos={place.photos || []}
            width={96}
            height={96}
            quality={240}
            loadDelay={200}
            borderRadius={16}
          />
        </View>
        <View style={styles.spotlightInfo}>
          <Text style={styles.spotlightTitle} numberOfLines={2}>{name}</Text>
          <Text style={styles.spotlightSub} numberOfLines={1}>
            {formatDistance(Math.round(place.distanceMeters ?? 0))} away
            {rating ? ` · ${rating}` : ''}
          </Text>
          <Text style={styles.spotlightHeadline}>
            Health{' '}
            {typeof ai?.healthScore === 'number' ? `${ai.healthScore.toFixed(1)}/10` : '-'}
          </Text>
        </View>
      </View>

      <View style={styles.spotlightScores}>
        <ScoreBar label="Health" value={ai?.healthScore} max={10} />
        <ScoreBar label="Recovery" value={ai?.workoutRecoveryScore} max={10} />
        <ScoreBar label="Processed" value={ai?.processedScore} max={10} />
        <StarScore label="Calories" value={ai?.calorieScore} />
        <StarScore label="Protein" value={ai?.proteinScore} />
        <StarScore label="Carbs" value={ai?.carbScore} />
      </View>

      <View style={styles.spotlightActions}>
        <TouchableOpacity
          style={[styles.spotlightAction, styles.spotlightActionPrimary, !mapsReady && styles.spotlightActionDisabled]}
          onPress={(e) => {
            e.stopPropagation();
            if (!mapsReady) return;
            openMaps(name, lat, lng);
          }}
        >
          <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={16} color="#FFFFFF" />
          <Text style={styles.spotlightActionText} numberOfLines={1}>
            {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.spotlightAction, styles.spotlightActionGhost]}
          onPress={(e) => {
            e.stopPropagation();
            onOpenMap();
          }}
        >
          <Ionicons name="map-outline" size={16} color="#F9A06F" />
          <Text style={[styles.spotlightActionText, styles.spotlightGhostText]} numberOfLines={1}>
            Map tab
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.spotlightHint}>Tap card for full details</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const [ordered, setOrdered] = useState<any[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'health');

  const loadSpotlight = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    startGpsPhase();
    try {
      const coords = await getLocation(false);
      if (!coords) {
        setErrorMsg('Turn on location to get your daily pick.');
        setOrdered([]);
        return;
      }
      const radius = await getSearchRadius();
      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        radius,
        onOrchestratorProgress,
        {
          onAiReady: (enriched) => {
            const open = enriched.filter((p: any) => isOpenNow(p)).sort(
              (a: any, b: any) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
            );
            const shuffled = shuffleDeterministic(open, daySeed());
            setOrdered(shuffled);
            setPickIndex(0);
          },
        }
      );
      const open = all.filter((p: any) => isOpenNow(p)).sort(
        (a: any, b: any) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
      );
      const shuffled = shuffleDeterministic(open, daySeed());
      setOrdered(shuffled);
      setPickIndex(0);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      setErrorMsg('Could not load restaurants nearby.');
      setOrdered([]);
    } finally {
      snapProgressComplete();
      setIsLoading(false);
    }
  }, [onOrchestratorProgress, snapProgressComplete, startFetchPhase, startGpsPhase]);

  useEffect(() => {
    loadSpotlight();
  }, [loadSpotlight]);

  const current = ordered[pickIndex];

  const pickAnother = () => {
    if (ordered.length <= 1) return;
    let next = pickIndex;
    let guard = 0;
    while (next === pickIndex && guard < 24) {
      next = Math.floor(Math.random() * ordered.length);
      guard += 1;
    }
    setPickIndex(next);
  };

  const openDetails = (item: any) => {
    setCurrentRestaurant(item);
    router.push('/random-result');
  };

  const emptyAfterLoad = !isLoading && !errorMsg && ordered.length === 0;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.text }]}>Find your meal</Text>

          {isLoading ? (
            <RestaurantLoadingProgressBar
              stageLabel={loadingStage}
              progress={loadingProgress}
              style={styles.loadingBox}
            />
          ) : errorMsg ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSpotlight}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : emptyAfterLoad ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>No open restaurants found nearby right now.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSpotlight}>
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : current ? (
            <DailySpotlightCard
              place={current}
              onPress={() => openDetails(current)}
              onOpenMap={() => router.push('/map' as any)}
            />
          ) : null}

          {!isLoading && !errorMsg && ordered.length > 0 && (
            <AnimatedPressable
              onPress={pickAnother}
              style={[styles.nextBtn, { backgroundColor: theme.cardBackground }]}
            >
              <Ionicons name="shuffle" size={26} color={theme.accent} />
              <Text style={[styles.nextLabel, { color: theme.text }]}>Next restaurant</Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            onPress={() => router.push('/pick-categories')}
            style={[styles.specificBtn, { borderColor: 'rgba(255,255,255,0.35)' }]}
          >
            <Ionicons name="options-outline" size={22} color={theme.text} />
            <Text style={[styles.specificLabel, { color: theme.text }]}>Try something specific</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, paddingTop: 44 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 18,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  loadingBox: { marginTop: 12 },
  messageBox: {
    backgroundColor: 'rgba(30,15,30,0.55)',
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  messageText: { fontSize: 15, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  retryBtn: {
    alignSelf: 'center',
    backgroundColor: '#F97352',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  spotlightCard: {
    backgroundColor: 'rgba(30,15,30,0.58)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 14,
  },
  spotlightBadge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    color: '#F9A06F',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  spotlightTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  spotlightThumbWrap: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden' },
  spotlightInfo: { flex: 1, gap: 4 },
  spotlightTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  spotlightSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  spotlightHeadline: { fontSize: 14, color: '#BFF5B8', fontWeight: '700', marginTop: 4 },
  spotlightScores: { gap: 10 },
  scoreItem: { gap: 4 },
  scoreLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { fontSize: 12, color: 'rgba(255,255,255,0.62)', fontWeight: '600' },
  scoreValue: { fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  scoreTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 4, backgroundColor: '#68D8A3' },
  starWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starRow: { flexDirection: 'row', gap: 3 },
  spotlightActions: { flexDirection: 'row', gap: 10 },
  spotlightAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  spotlightActionPrimary: { backgroundColor: '#F97352' },
  spotlightActionGhost: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  spotlightActionDisabled: { opacity: 0.45 },
  spotlightActionText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  spotlightGhostText: { color: '#F9A06F' },
  spotlightHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: -4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  nextLabel: { fontSize: 18, fontWeight: '800' },
  specificBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  specificLabel: { flex: 1, fontSize: 17, fontWeight: '700' },
});
