import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { ScenarioQuickBar } from '@/components/ScenarioQuickBar';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { getLocation } from '@/core/locationCache';
import { RestaurantImage } from '@/core/images';
import { fetchIsLikelyRainNow } from '@/core/openMeteoWeather';
import { scoreRestaurantPool } from '@/core/recommendationEngine';
import { getRecommendationPrefs } from '@/core/recommendationPrefs';
import {
  defaultGroupToSessionChip,
  inferMealTypeFromClock,
  radiusIdToMeters,
  type RecommendationPrefsV1,
  type ScoredRestaurant,
  type SessionOverrides,
} from '@/core/recommendationTypes';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { appendVisit, loadVisits } from '@/core/recommendationVisitHistory';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const WINDOW_WIDTH = Dimensions.get('window').width;
const CAROUSEL_PAGE = WINDOW_WIDTH;
const FILM_STRIP_FRAC = 0.66;
const FILM_GAP = 2;
const FILM_STRIP_WIDTH = WINDOW_WIDTH * FILM_STRIP_FRAC;
const FILM_CARD_W = (FILM_STRIP_WIDTH - 9 * FILM_GAP) / 10;
const FILM_CARD_H = FILM_CARD_W * 1.55;

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

function SpotlightCard({
  scored,
  pickIndex,
  pickTotal,
  onPress,
  onOpenMap,
}: {
  scored: ScoredRestaurant;
  pickIndex: number;
  pickTotal: number;
  onPress: () => void;
  onOpenMap: () => void;
}) {
  const place = scored.place;
  const name = place.displayName?.text || 'Unknown';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;
  const match = Math.round(scored.plateboundScore);

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.spotlightCard} onPress={onPress}>
      <Text style={styles.spotlightBadge}>
        Top picks · {pickIndex + 1} / {pickTotal}
      </Text>
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
          <Text style={styles.spotlightTitle} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.spotlightSub} numberOfLines={1}>
            {formatDistance(Math.round(place.distanceMeters ?? 0))} away
            {rating ? ` · ${rating}` : ''}
          </Text>
          <Text style={styles.matchLine}>
            {match}% match
          </Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        {scored.matchPills.map(p => (
          <View key={p.kind} style={styles.pill}>
            <Text style={styles.pillEmoji}>{p.emoji}</Text>
            <Text style={styles.pillLabel} numberOfLines={1}>
              {p.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.spotlightActions}>
        <TouchableOpacity
          style={[styles.spotlightAction, styles.spotlightActionPrimary, !mapsReady && styles.spotlightActionDisabled]}
          onPress={e => {
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
          onPress={e => {
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
  const tabBarHeight = useBottomTabBarHeight();
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const sessionRadiusRef = useRef(4000);
  const carouselRef = useRef<FlatList<ScoredRestaurant>>(null);

  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);
  const [session, setSession] = useState<SessionOverrides | null>(null);
  const [rawPlaces, setRawPlaces] = useState<any[]>([]);
  const [ranked, setRanked] = useState<ScoredRestaurant[]>([]);
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

  const topTen = useMemo(() => ranked.slice(0, 10), [ranked]);

  useEffect(() => {
    void getRecommendationPrefs().then(p => {
      setPrefs(p);
      setSession({
        mealType: inferMealTypeFromClock(),
        groupSize: defaultGroupToSessionChip(p.defaultGroupSize),
        budgetCeiling: p.budgetCeiling,
        radiusMeters: radiusIdToMeters(p.defaultRadius),
        sessionMood: null,
      });
    });
  }, []);

  useEffect(() => {
    if (session) sessionRadiusRef.current = session.radiusMeters;
  }, [session?.radiusMeters]);

  const recompute = useCallback(async () => {
    const coords = coordsRef.current;
    if (!prefs || !session || !coords || rawPlaces.length === 0) return;
    const visits = await loadVisits();
    const rainy = await fetchIsLikelyRainNow(coords.latitude, coords.longitude);
    const scored = scoreRestaurantPool(rawPlaces, {
      prefs,
      session,
      visits,
      userLat: coords.latitude,
      userLng: coords.longitude,
      rainyWeather: rainy === true ? true : undefined,
    });
    setRanked(scored);
    setPickIndex(0);
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [prefs, session, rawPlaces]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  useEffect(() => {
    setPickIndex(i => Math.min(i, Math.max(0, topTen.length - 1)));
  }, [topTen.length]);

  const loadSpotlight = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    startGpsPhase();
    try {
      const coords = await getLocation(false);
      if (!coords) {
        setErrorMsg('Turn on location to get your daily pick.');
        setRawPlaces([]);
        return;
      }
      coordsRef.current = coords;
      const p = prefs ?? (await getRecommendationPrefs());
      const rad = sessionRadiusRef.current || radiusIdToMeters(p.defaultRadius);
      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        rad,
        onOrchestratorProgress,
        {
          onAiReady: enriched => {
            setRawPlaces(enriched);
          },
        }
      );
      setRawPlaces(all);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      setErrorMsg('Could not load restaurants nearby.');
      setRawPlaces([]);
    } finally {
      snapProgressComplete();
      setIsLoading(false);
    }
  }, [onOrchestratorProgress, snapProgressComplete, startFetchPhase, startGpsPhase]);

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlight();
    }
  }, [loadSpotlight, prefs, session?.radiusMeters]);

  const goToPick = useCallback((i: number) => {
    const max = Math.max(0, topTen.length - 1);
    const next = Math.min(Math.max(0, i), max);
    setPickIndex(next);
    carouselRef.current?.scrollToOffset({ offset: next * CAROUSEL_PAGE, animated: true });
  }, [topTen.length]);

  const onCarouselMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / CAROUSEL_PAGE);
      const max = Math.max(0, topTen.length - 1);
      setPickIndex(Math.min(Math.max(0, i), max));
    },
    [topTen.length]
  );

  const openDetails = async (item: ScoredRestaurant) => {
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    setCurrentRestaurant(item.place);
    router.push('/random-result');
  };

  const emptyAfterLoad = !isLoading && !errorMsg && ranked.length === 0;
  const scrollBottomPad = tabBarHeight + 16;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.text }]}>Top 10 picks</Text>

          <ScenarioQuickBar />

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
              <Text style={styles.messageText}>No restaurants matched your filters nearby.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSpotlight}>
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : topTen.length > 0 ? (
            <View style={styles.galleryBlock}>
              <FlatList
                ref={carouselRef}
                data={topTen}
                keyExtractor={item => String(item.place?.id ?? '')}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onCarouselMomentumEnd}
                getItemLayout={(_, index) => ({
                  length: CAROUSEL_PAGE,
                  offset: CAROUSEL_PAGE * index,
                  index,
                })}
                renderItem={({ item, index }) => (
                  <View style={{ width: CAROUSEL_PAGE, paddingHorizontal: 20 }}>
                    <SpotlightCard
                      scored={item}
                      pickIndex={index}
                      pickTotal={topTen.length}
                      onPress={() => void openDetails(item)}
                      onOpenMap={() => router.push('/map' as any)}
                    />
                  </View>
                )}
              />
              <View style={[styles.filmstripWrap, { width: FILM_STRIP_WIDTH }]}>
                <View style={[styles.filmstripRow, { gap: FILM_GAP, width: FILM_STRIP_WIDTH }]}>
                  {topTen.map((scored, i) => {
                    const place = scored.place;
                    return (
                      <TouchableOpacity
                        key={String(place?.id ?? i)}
                        activeOpacity={0.85}
                        onPress={() => goToPick(i)}
                        style={[
                          styles.filmstripThumb,
                          {
                            width: FILM_CARD_W,
                            height: FILM_CARD_H,
                          },
                          i === pickIndex && styles.filmstripThumbActive,
                        ]}
                      >
                        <Text style={styles.filmstripMark}>?</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}
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
    gap: 18,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  galleryBlock: { marginHorizontal: -20 },
  filmstripWrap: { alignSelf: 'center' },
  filmstripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  filmstripThumb: {
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(30,15,30,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmstripThumbActive: {
    borderColor: '#F9A06F',
    backgroundColor: 'rgba(45,25,45,0.88)',
  },
  filmstripMark: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.55)',
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
  matchLine: { fontSize: 16, color: '#BFF5B8', fontWeight: '800', marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  pillEmoji: { fontSize: 14 },
  pillLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', flexShrink: 1 },
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
});
