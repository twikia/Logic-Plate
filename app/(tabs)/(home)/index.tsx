import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { ScenarioQuickBar } from '@/components/ScenarioQuickBar';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { getLocation } from '@/core/locationCache';
import type { AiOverview } from '@/core/aiOverviewCache';
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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const WINDOW_WIDTH = Dimensions.get('window').width;
const WINDOW_HEIGHT = Dimensions.get('window').height;
const CAROUSEL_PAGE = WINDOW_WIDTH;
const FILM_STRIP_FRAC = 0.66;
const FILM_GAP = 2;
const FILM_STRIP_WIDTH = WINDOW_WIDTH * FILM_STRIP_FRAC;
const FILM_CARD_W = (FILM_STRIP_WIDTH - 9 * FILM_GAP) / 10;
const FILM_CARD_H = FILM_CARD_W * 1.55;

const FILMSTRIP_ICONS: React.ComponentProps<typeof Ionicons>['name'][] = [
  'restaurant-outline',
  'fast-food-outline',
  'wine-outline',
  'cafe-outline',
  'pizza-outline',
  'ice-cream-outline',
  'nutrition-outline',
  'fish-outline',
];

function stripIconForPlaceId(id: string): React.ComponentProps<typeof Ionicons>['name'] {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return FILMSTRIP_ICONS[Math.abs(h) % FILMSTRIP_ICONS.length] ?? 'restaurant-outline';
}

const FILMSTRIP_PALETTE: { bg: string; border: string; mark: string }[] = [
  { bg: 'rgba(249,115,82,0.62)', border: '#FFD4CC', mark: '#3F0D00' },
  { bg: 'rgba(250,204,21,0.55)', border: '#FFF7C2', mark: '#3A2800' },
  { bg: 'rgba(74,222,128,0.52)', border: '#DCFCE7', mark: '#0F2918' },
  { bg: 'rgba(56,189,248,0.55)', border: '#CFFAFE', mark: '#082F49' },
  { bg: 'rgba(167,139,250,0.58)', border: '#EDE9FE', mark: '#2E1065' },
  { bg: 'rgba(244,114,182,0.55)', border: '#FCE7F3', mark: '#4A051E' },
  { bg: 'rgba(45,212,191,0.52)', border: '#CCFBF1', mark: '#042F2E' },
  { bg: 'rgba(251,146,60,0.58)', border: '#FFEDD5', mark: '#431407' },
  { bg: 'rgba(129,140,248,0.55)', border: '#E0E7FF', mark: '#1E1B4B' },
  { bg: 'rgba(250,112,154,0.55)', border: '#FFE4E9', mark: '#4A0D24' },
];

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

function clampScore(v: number, max: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

function polygonRing(cx: number, cy: number, radius: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return `${cx + radius * Math.cos(t)},${cy + radius * Math.sin(t)}`;
  }).join(' ');
}

function scoreAxis(ai: AiOverview | null | undefined, key: keyof AiOverview): number | null {
  if (!ai) return null;
  const v = ai[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatAxisReading(max: 5 | 10, s: number | null): string {
  if (s == null) return '—';
  if (max === 10) return `${clampScore(s, max).toFixed(1)}/${max}`;
  return `${Math.round(clampScore(s, max))}/${max}`;
}

function RestaurantScorePentagon({ ai, stroke }: { ai: AiOverview | null | undefined; stroke: string }) {
  const n = 5;
  const axes: { key: keyof AiOverview; corner: string; max: 5 | 10 }[] = [
    { key: 'healthScore', corner: 'Health', max: 10 },
    { key: 'tasteScore', corner: 'Taste', max: 5 },
    { key: 'valueForMoneyScore', corner: 'Value', max: 5 },
    { key: 'dateWorthiness', corner: 'Date', max: 5 },
    { key: 'speedScore', corner: 'Speed', max: 5 },
  ];
  const norms = axes.map(({ key, max }) => {
    const s = scoreAxis(ai, key);
    if (s == null) return 0;
    return clampScore(s, max) / max;
  });
  const cx = 50;
  const cy = 50;
  const R = 26;
  const labelR = 36;
  const fillPts = norms
    .map((norm, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = norm * R;
      return `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`;
    })
    .join(' ');
  return (
    <View style={styles.radarBlock}>
      <Svg width="100%" height={118} viewBox="-8 -10 116 120" preserveAspectRatio="xMidYMid meet">
        <Polygon points={polygonRing(cx, cy, R * 0.35, n)} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.35} />
        <Polygon points={polygonRing(cx, cy, R * 0.68, n)} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.35} />
        <Polygon points={polygonRing(cx, cy, R, n)} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" strokeWidth={0.45} />
        <Polygon points={fillPts} fill={`${stroke}55`} stroke={stroke} strokeWidth={1.1} strokeLinejoin="round" />
        {axes.map(({ key, corner, max }, i) => {
          const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const lx = cx + labelR * Math.cos(t);
          const ly = cy + labelR * Math.sin(t);
          const s = scoreAxis(ai, key);
          const reading = formatAxisReading(max, s);
          return (
            <G key={corner}>
              <SvgText
                x={lx}
                y={ly - 2.2}
                fill="rgba(255,255,255,0.62)"
                fontSize={4.4}
                fontWeight="700"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {corner}
              </SvgText>
              <SvgText
                x={lx}
                y={ly + 3.4}
                fill="rgba(255,255,255,0.45)"
                fontSize={3.6}
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {reading}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function EngineStatBars({ raw }: { raw: ScoredRestaurant['raw'] }) {
  const rows: { label: string; value: number; colors: [string, string] }[] = [
    { label: 'Distance', value: raw.distance, colors: ['#7DD3FC', '#38BDF8'] },
    { label: 'Health', value: raw.health, colors: ['#86EFAC', '#4ADE80'] },
    { label: 'Price', value: raw.price, colors: ['#FDE68A', '#FBBF24'] },
    { label: 'Rated', value: raw.rating, colors: ['#FBCFE8', '#F472B6'] },
    { label: 'Novelty', value: raw.novelty, colors: ['#C4B5FD', '#A78BFA'] },
  ];
  return (
    <View style={styles.engineBars}>
      {rows.map(row => {
        return (
          <View key={row.label} style={styles.engineBarRow}>
            <Text style={styles.engineBarLabel}>{row.label}</Text>
            <View style={styles.engineBarTrack}>
              <View style={[styles.engineBarFillWrap, { width: `${clampScore(row.value, 100)}%` as DimensionValue }]}>
                <LinearGradient
                  colors={row.colors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SpotlightCard({
  scored,
  canReject,
  onReject,
  onPress,
  onOpenMap,
}: {
  scored: ScoredRestaurant;
  canReject: boolean;
  onReject: () => void;
  onPress: () => void;
  onOpenMap: () => void;
}) {
  const { theme } = useAppTheme();
  const place = scored.place;
  const name = place.displayName?.text || 'Unknown';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;
  const match = Math.round(scored.plateboundScore);
  const ai = place.aiOverview as AiOverview | null | undefined;
  const reviewCount =
    typeof place.userRatingCount === 'number' && place.userRatingCount > 0
      ? `${place.userRatingCount.toLocaleString()} reviews`
      : null;

  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);

  const rejectRef = useRef(onReject);
  rejectRef.current = onReject;
  const fireReject = useCallback(() => {
    rejectRef.current();
  }, []);

  const playDismissAnim = useCallback(() => {
    const target = WINDOW_HEIGHT * 0.55;
    ty.value = withTiming(target, { duration: 280 }, finished => {
      if (finished) runOnJS(fireReject)();
    });
    opacity.value = withTiming(0, { duration: 260 });
  }, [fireReject, opacity, ty]);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.spotlightCard, cardAnim]}>
      <TouchableOpacity activeOpacity={0.92} style={styles.spotlightPressLayer} onPress={onPress}>
        {canReject ? (
          <TouchableOpacity
            style={styles.spotlightReject}
            onPress={e => {
              e.stopPropagation();
              playDismissAnim();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.92)" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.spotlightHeroRow}>
          <View style={styles.spotlightTitleBlock}>
            <Text style={styles.spotlightTitle} numberOfLines={3}>
              {name}
            </Text>
            <Text style={styles.spotlightSub} numberOfLines={2}>
              {formatDistance(Math.round(place.distanceMeters ?? 0))} away
              {rating ? ` · ${rating}★` : ''}
              {reviewCount ? ` · ${reviewCount}` : ''}
            </Text>
          </View>
          <View style={styles.matchOrb}>
            <LinearGradient colors={['#FDBA74', '#F97352']} style={styles.matchOrbGrad}>
              <Text style={styles.matchOrbPct}>{match}</Text>
              <Text style={styles.matchOrbLbl}>match</Text>
            </LinearGradient>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Match engine</Text>
        <View style={styles.scoreShapeRow}>
          <View style={styles.scorePentagonCol}>
            <RestaurantScorePentagon ai={ai} stroke={theme.accent} />
          </View>
          <View style={styles.scoreBarsCol}>
            <Text style={styles.valueMatchHeading}>value match </Text>
            <EngineStatBars raw={scored.raw} />
          </View>
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
        <Text style={styles.spotlightHint}>Tap for more details.</Text>
      </TouchableOpacity>
    </Animated.View>
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
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(() => new Set());
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const visibleLenRef = useRef(-1);
  const pickIndexRef = useRef(0);
  pickIndexRef.current = pickIndex;

  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'health');

  const visibleList = useMemo(() => {
    return ranked.filter(r => !rejectedIds.has(String(r.place?.id ?? ''))).slice(0, 10);
  }, [ranked, rejectedIds]);

  const rejectPickAt = useCallback(
    (placeId: string) => {
      setRejectedIds(prev => {
        const curList = ranked.filter(r => !prev.has(String(r.place?.id ?? ''))).slice(0, 10);
        if (curList.length <= 1) return prev;
        const idx = curList.findIndex(r => String(r.place?.id ?? '') === placeId);
        if (idx < 0) return prev;
        const p = pickIndexRef.current;
        if (idx < p) setPickIndex(p - 1);
        else if (idx > p) setPickIndex(p);
        else setPickIndex(Math.min(p, curList.length - 2));
        return new Set(prev).add(placeId);
      });
    },
    [ranked]
  );

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
    setRejectedIds(new Set());
    setPickIndex(0);
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [prefs, session, rawPlaces]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  useEffect(() => {
    setPickIndex(i => Math.min(i, Math.max(0, visibleList.length - 1)));
  }, [visibleList.length]);

  useLayoutEffect(() => {
    if (visibleList.length !== visibleLenRef.current) {
      visibleLenRef.current = visibleList.length;
      const i = Math.min(Math.max(0, pickIndex), Math.max(0, visibleList.length - 1));
      carouselRef.current?.scrollToOffset({ offset: i * CAROUSEL_PAGE, animated: false });
    }
  }, [visibleList.length, pickIndex]);

  const loadSpotlight = useCallback(async (opts?: { skipFullScreenLoader?: boolean }) => {
    const skipLoader = opts?.skipFullScreenLoader === true;
    if (!skipLoader) {
      setIsLoading(true);
    }
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
      if (!skipLoader) {
        setIsLoading(false);
      }
    }
  }, [onOrchestratorProgress, prefs, snapProgressComplete, startFetchPhase, startGpsPhase]);

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await loadSpotlight({ skipFullScreenLoader: true });
    } finally {
      setPullRefreshing(false);
    }
  }, [loadSpotlight]);

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlight();
    }
  }, [loadSpotlight, prefs, session?.radiusMeters]);

  const goToPick = useCallback((i: number) => {
    const max = Math.max(0, visibleList.length - 1);
    const next = Math.min(Math.max(0, i), max);
    setPickIndex(next);
    carouselRef.current?.scrollToOffset({ offset: next * CAROUSEL_PAGE, animated: true });
  }, [visibleList.length]);

  const onCarouselMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / CAROUSEL_PAGE);
      const max = Math.max(0, visibleList.length - 1);
      setPickIndex(Math.min(Math.max(0, i), max));
    },
    [visibleList.length]
  );

  const openDetails = async (item: ScoredRestaurant) => {
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    setCurrentRestaurant(item.place);
    router.push('/random-result');
  };

  const noPlacesAtAll = !isLoading && !errorMsg && ranked.length === 0;
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
          style={styles.homeScroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPad, flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={Platform.OS === 'ios'}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={onPullRefresh}
              tintColor="#F97352"
              colors={['#F97352', '#F9A06F']}
            />
          }
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
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSpotlight()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : noPlacesAtAll ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>No restaurants matched your filters nearby.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSpotlight()}>
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : visibleList.length > 0 ? (
            <View style={styles.galleryBlock}>
              <FlatList
                ref={carouselRef}
                data={visibleList}
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
                renderItem={({ item }) => (
                  <View style={{ width: CAROUSEL_PAGE, paddingHorizontal: 10 }}>
                    <SpotlightCard
                      scored={item}
                      canReject={visibleList.length > 1}
                      onReject={() => rejectPickAt(String(item.place?.id ?? ''))}
                      onPress={() => void openDetails(item)}
                      onOpenMap={() => router.push('/map' as any)}
                    />
                  </View>
                )}
              />
              <View style={[styles.filmstripWrap, { width: FILM_STRIP_WIDTH }]}>
                <View style={[styles.filmstripRow, { gap: FILM_GAP, width: FILM_STRIP_WIDTH }]}>
                  {visibleList.map((scored, i) => {
                    const place = scored.place;
                    const pid = String(place?.id ?? i);
                    const pal = FILMSTRIP_PALETTE[i % FILMSTRIP_PALETTE.length];
                    const active = i === pickIndex;
                    const dist = Math.abs(i - pickIndex);
                    const scale = dist === 0 ? 1.46 : dist === 1 ? 0.94 : 0.78;
                    const iconName = stripIconForPlaceId(pid);
                    return (
                      <TouchableOpacity
                        key={pid}
                        activeOpacity={0.85}
                        onPress={() => goToPick(i)}
                        style={[
                          styles.filmstripThumb,
                          {
                            width: FILM_CARD_W,
                            height: FILM_CARD_H,
                            backgroundColor: pal.bg,
                            borderColor: active ? theme.accent : pal.border,
                            transform: [{ scale }],
                            zIndex: active ? 2 : 1,
                          },
                          active && styles.filmstripThumbActive,
                        ]}
                      >
                        <Ionicons name={iconName} size={17} color={pal.mark} />
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
  safeArea: { flex: 1, paddingTop: 56 },
  homeScroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
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
    paddingVertical: 12,
  },
  filmstripThumb: {
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmstripThumbActive: {
    borderWidth: 2.5,
    shadowColor: '#F9A06F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 5,
    elevation: 5,
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
    alignSelf: 'center',
    width: '100%',
    backgroundColor: 'rgba(22,10,28,0.72)',
    borderRadius: 26,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12,
  },
  spotlightPressLayer: {
    padding: 18,
    gap: 12,
  },
  spotlightReject: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  spotlightHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  spotlightTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 48,
    gap: 6,
  },
  spotlightTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  spotlightSub: { fontSize: 12, color: 'rgba(255,255,255,0.62)' },
  matchOrb: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
  },
  matchOrbGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  matchOrbPct: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginTop: -2 },
  matchOrbLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  scoreShapeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  scorePentagonCol: {
    width: 128,
    flexShrink: 0,
    alignItems: 'center',
  },
  scoreBarsCol: {
    flex: 1,
    minWidth: 0,
  },
  valueMatchHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 2,
  },
  radarBlock: { width: '100%', marginTop: 0 },
  engineBars: { gap: 6, marginTop: 0 },
  engineBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engineBarLabel: { width: 72, fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  engineBarTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    maxWidth: '100%',
  },
  engineBarFillWrap: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  spotlightActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
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
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 2,
  },
});
