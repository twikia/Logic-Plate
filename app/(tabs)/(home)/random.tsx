import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { NeonGradientTitle } from '@/components/NeonGradientTitle';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TouchableOpacity } from '@/components/ui/soundPressable';
import {
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReAnimated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { AiOverview } from '../../../core/aiOverviewCache';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';
import { calculatePlateboundScore } from '../../../core/ratingCalculator';
import { getLocation } from '../../../core/locationCache';
import {
  getNearbyRestaurants,
  isRestaurantFetchError,
  isRestaurantLoadSupersededError,
} from '../../../core/restaurantOrchestrator';
import {
  DEFAULT_SEARCH_RADIUS_METERS,
  SEARCH_RADIUS_OPTIONS_METERS,
} from '../../../core/searchRadiusOptions';
import { replaceCurrentRestaurantIfInList, setCurrentRestaurant } from '../../../core/currentSelection';
import {
  getScenarioPreferredSort,
  normalizeScenarioKey,
  restaurantMatchesScenario,
  type ScenarioKey,
} from '../../../core/scenarioFilters';
import { tCuisineLabel, tScenarioLabel, tScoreLabel, tSortLabel } from '../../../core/i18nLabels';
import {
  DEFAULT_RANDOM_AI_CUTOFFS,
  clearRandomPickerState,
  getRandomPickerState,
  isRandomSortBy,
  mergeRandomAiCutoffs,
  onRandomPickerReset,
  saveRandomPickerState,
  type RandomAiCutoffKey,
  type RandomAiCutoffs,
  type RandomSortBy,
} from '../../../core/randomPickerState';
import { pickFunSelectTitle } from '../../../core/homeTitle';
import {
  SORT_OPTIONS,
  compareRestaurantsBySort,
  getOverviewMetric,
  lerpRedGreen,
} from '../../../core/restaurantSort';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '../../../core/images';
import { placeOffersSweets } from '../../../core/placeSweets';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import type { ThemeColors } from '@/themes/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NEON_CYAN = '#00FFFF';
const NEON_MAGENTA = '#FF00FF';

const CUISINE_TYPE_MAP: Record<string, string[]> = {
  italian: ['italian_restaurant'],
  mexican: ['mexican_restaurant'],
  japanese: ['japanese_restaurant'],
  chinese: ['chinese_restaurant'],
  american: ['american_restaurant', 'hamburger_restaurant'],
  indian: ['indian_restaurant'],
  thai: ['thai_restaurant'],
  mediterranean: ['mediterranean_restaurant'],
  cafe: ['cafe', 'coffee_shop', 'tea_house'],
  drinks: ['bar', 'wine_bar', 'sports_bar', 'pub', 'brewery', 'night_club'],
  non_food: [
    'bakery',
    'dessert_shop',
    'juice_shop',
    'donut_shop',
    'candy_store',
    'chocolate_shop',
    'confectionery',
    'ice_cream_shop',
    'liquor_store',
    'acai_shop',
  ],
  bars: ['bar', 'wine_bar', 'sports_bar', 'pub', 'brewery', 'night_club'],
  smoothies: ['ice_cream_shop', 'juice_shop'],
  seafood: ['seafood_restaurant'],
  steakhouse: ['steak_house'],
  vegan: ['vegan_restaurant', 'vegetarian_restaurant'],
  pizza: ['pizza_restaurant'],
  dessert: [
    'dessert_shop',
    'dessert_restaurant',
    'ice_cream_shop',
    'donut_shop',
    'candy_store',
    'chocolate_shop',
    'confectionery',
    'cake_shop',
    'pastry_shop',
    'acai_shop',
  ],
};

function themedColors(theme: ThemeColors, neonUi: boolean) {
  const accentOn = theme.accentOnColor ?? '#FFFFFF';
  return {
    accentOn,
    pageBg: neonUi ? '#000000' : theme.gradient[0],
    panelBg: neonUi ? 'rgba(0,0,0,0.92)' : theme.cardBackground,
    panelBorder: neonUi ? 'rgba(0,255,255,0.22)' : theme.cardBorderColor,
    glass: neonUi ? 'rgba(0,255,255,0.08)' : theme.glassBackground,
    glassBorder: neonUi ? 'rgba(0,255,255,0.16)' : theme.cardBorderColor,
    rowBg: neonUi ? 'rgba(0,255,255,0.05)' : theme.glassBackground,
    rowBorder: neonUi ? 'rgba(0,255,255,0.14)' : theme.cardBorderColor,
    rowSelectedBg: neonUi ? 'rgba(0,255,255,0.12)' : `${theme.accent}1A`,
    rowSelectedBorder: neonUi ? 'rgba(0,255,255,0.5)' : `${theme.accent}80`,
    chipBg: neonUi ? 'rgba(0,255,255,0.06)' : 'rgba(255,255,255,0.05)',
    chipBorder: neonUi ? 'rgba(0,255,255,0.18)' : 'rgba(255,255,255,0.12)',
    chipActiveBg: theme.accent,
    chipActiveText: accentOn,
    metaPillBg: neonUi ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.08)',
    metaPillBorder: neonUi ? 'rgba(0,255,255,0.2)' : 'rgba(255,255,255,0.06)',
    distanceIcon: neonUi ? NEON_CYAN : theme.accent,
    priceColor: neonUi ? NEON_MAGENTA : theme.tint,
    pickGradient: neonUi
      ? ([NEON_CYAN, NEON_MAGENTA] as [string, string])
      : ([theme.accent, theme.tint] as [string, string]),
    sliderMin: theme.accent,
    modalBg: neonUi ? 'rgba(0,0,0,0.96)' : theme.cardBackground,
    modalBorder: neonUi ? 'rgba(0,255,255,0.22)' : theme.cardBorderColor,
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  const { theme } = useAppTheme();
  const neonUi = Boolean(theme.neonColors);
  const tc = themedColors(theme, neonUi);
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: pulse,
          backgroundColor: tc.rowBg,
          borderColor: tc.rowBorder,
        },
      ]}
    >
      <View style={[styles.skeletonThumb, { backgroundColor: theme.imageBackdrop }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 15, width: '70%', backgroundColor: tc.chipBg, borderRadius: 6 }} />
        <View style={{ height: 12, width: '45%', backgroundColor: tc.chipBg, borderRadius: 6 }} />
      </View>
    </Animated.View>
  );
}

const AI_METRICS: { key: RandomAiCutoffKey; scale: 'five' | 'ten' }[] = [
  { key: 'taste', scale: 'five' },
  { key: 'valueForMoney', scale: 'five' },
  { key: 'speed', scale: 'five' },
  { key: 'workoutRecovery', scale: 'ten' },
  { key: 'munchy', scale: 'five' },
  { key: 'protein', scale: 'five' },
  { key: 'calorie', scale: 'five' },
  { key: 'dateWorthiness', scale: 'five' },
  { key: 'soloDiner', scale: 'five' },
  { key: 'energySustain', scale: 'five' },
];

type AiMetricSlot = { key: RandomAiCutoffKey | null; min: number };

function metricScale(key: RandomAiCutoffKey): 'five' | 'ten' {
  return AI_METRICS.find((m) => m.key === key)?.scale ?? 'five';
}

function slotsToCutoffs(a: AiMetricSlot, b: AiMetricSlot): RandomAiCutoffs {
  const o: RandomAiCutoffs = { ...DEFAULT_RANDOM_AI_CUTOFFS };
  if (a.key != null && a.min > 0) o[a.key] = a.min;
  if (b.key != null && b.min > 0) o[b.key] = b.min;
  return o;
}

function cutoffsToSlots(cutoffs: RandomAiCutoffs): [AiMetricSlot, AiMetricSlot] {
  const entries = (Object.keys(cutoffs) as RandomAiCutoffKey[])
    .filter((k) => cutoffs[k] > 0)
    .map((k) => ({ key: k, min: cutoffs[k] }));
  return [entries[0] ?? { key: null, min: 0 }, entries[1] ?? { key: null, min: 0 }];
}

function passesAiCutoffs(r: { aiOverview?: AiOverview | null }, cutoffs: RandomAiCutoffs): boolean {
  const ai = r.aiOverview;
  for (const key of Object.keys(cutoffs) as RandomAiCutoffKey[]) {
    const min = cutoffs[key];
    if (min <= 0) continue;
    const v = getOverviewMetric(ai, key);
    if (v < min) return false;
  }
  return true;
}

// ─── Selectable Restaurant Row ────────────────────────────────────────────────

function RestaurantRow({
  item,
  selected,
  onOpenDetail,
  onToggleSelect,
}: {
  item: any;
  selected: boolean;
  onOpenDetail: () => void;
  onToggleSelect: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const neonUi = Boolean(theme.neonColors);
  const tc = themedColors(theme, neonUi);
  const { formatDistance } = useDistanceFormatter();

  const name = item.displayName?.text || t('common.unknown');
  const ai = item.aiOverview as AiOverview | undefined | null;
  const distM = Math.round(item.distanceMeters ?? 0);
  const dist = formatDistance(distM);
  const price = formatPlacePriceLabel(item);
  const overall = calculatePlateboundScore(ai, item.rating, item.priceLevel);
  const healthNum = typeof ai?.healthScore === 'number' ? ai.healthScore : null;
  const ratingColor =
    typeof item.rating === 'number' && item.rating > 0
      ? lerpRedGreen(Math.max(0, Math.min(1, item.rating / 5)))
      : theme.subtext;
  const healthColor =
    healthNum != null ? lerpRedGreen(Math.max(0, Math.min(1, healthNum / 10))) : theme.subtext;
  const lat = item.location?.latitude;
  const lng = item.location?.longitude;
  const [photos, setPhotos] = useState<any[]>(item.photos || []);

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      if (!item?.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return;

      const urls = await fetchRestaurantPhotoUrls({
        placeId:          item.id,
        name,
        latitude:         lat,
        longitude:        lng,
        websiteUrl:       item.websiteUri || undefined,
        formattedAddress: item.formattedAddress || undefined,
        cuisineKey:       item.primaryType?.replace(/_restaurant$/, '') || undefined,
      });

      if (cancelled) return;
      setPhotos(urls.length > 0 ? urls : (item.photos || []));
    };

    loadPhotos();
    return () => { cancelled = true; };
  }, [item?.id, name, lat, lng, item?.photos, item.primaryType, item.websiteUri, item.formattedAddress]);

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: selected ? tc.rowSelectedBg : tc.rowBg,
          borderColor: selected ? tc.rowSelectedBorder : tc.rowBorder,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onOpenDetail}
        style={styles.rowMainTap}
      >
        <View style={[styles.thumbWrap, { backgroundColor: theme.imageBackdrop }]}>
          <RestaurantImage
            restaurantId={item.id}
            photos={photos}
            width={52}
            height={52}
            quality={200}
            loadDelay={400}
            borderRadius={11}
          />
        </View>

        <View style={styles.rowTextCol}>
          <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{name}</Text>
          <View style={styles.rowMeta}>
            {typeof item.rating === 'number' && item.rating > 0 ? (
              <View style={[styles.metaPill, { backgroundColor: tc.metaPillBg, borderColor: tc.metaPillBorder }]}>
                <Ionicons name="star" size={9} color={ratingColor} />
                <Text style={[styles.metaText, { color: ratingColor, fontWeight: '700' }]}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.metaPill, { backgroundColor: tc.metaPillBg, borderColor: tc.metaPillBorder }]}>
              <Ionicons name="ribbon-outline" size={9} color={neonUi ? NEON_MAGENTA : theme.tint} />
              <Text style={[styles.rowPlateboundScore, { color: neonUi ? NEON_MAGENTA : theme.tint }]}>
                {overall > 0 ? overall.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: tc.metaPillBg, borderColor: tc.metaPillBorder }]}>
              <Ionicons name="heart-outline" size={9} color={healthColor} />
              <Text style={[styles.metaText, { color: healthColor, fontWeight: '700' }]}>
                {healthNum != null ? `${healthNum.toFixed(1)}/10` : '—'}
              </Text>
            </View>
            {price ? (
              <View style={[styles.metaPill, { backgroundColor: tc.metaPillBg, borderColor: tc.metaPillBorder }]}>
                <Text style={[styles.metaText, { color: tc.priceColor }]}>{price}</Text>
              </View>
            ) : null}
            <View style={[styles.metaPill, { backgroundColor: tc.metaPillBg, borderColor: tc.metaPillBorder }]}>
              <Ionicons name="navigate-outline" size={9} color={tc.distanceIcon} />
              <Text style={[styles.metaText, { color: theme.subtext }]}>{dist}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onToggleSelect}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[
          styles.checkbox,
          { borderColor: selected ? theme.accent : tc.chipBorder },
          selected && { backgroundColor: theme.accent, borderColor: theme.accent },
        ]}
      >
        {selected && <Ionicons name="checkmark" size={16} color={tc.accentOn} />}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RandomScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useAppTheme();
  const neonUi = Boolean(theme.neonColors);
  const tc = useMemo(() => themedColors(theme, neonUi), [theme, neonUi]);
  const params = useLocalSearchParams<{ scenario?: string | string[] }>();
  const paramScenario = useMemo((): ScenarioKey | null => {
    const raw = params.scenario;
    const s = Array.isArray(raw) ? raw[0] : raw;
    return normalizeScenarioKey(s);
  }, [params.scenario]);

  const [allResults, setAllResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [radius, setRadius] = useState(DEFAULT_SEARCH_RADIUS_METERS);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const hasFocusedOnceRef = useRef(false);
  const [showRadius, setShowRadius] = useState(false);
  const { formatLabel } = useDistanceFormatter();

  // ── Filter state ──
  const [showFilters, setShowFilters] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedPrices, setSelectedPrices] = useState<Set<string>>(new Set());
  const [minRating, setMinRating] = useState(0);
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<RandomSortBy>('distance');
  const [aiSlot1, setAiSlot1] = useState<AiMetricSlot>({ key: null, min: 0 });
  const [aiSlot2, setAiSlot2] = useState<AiMetricSlot>({ key: null, min: 0 });
  const [categoryModal, setCategoryModal] = useState<1 | 2 | null>(null);
  const [openCheckEpoch, setOpenCheckEpoch] = useState(0);
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey | null>(null);
  const [scenarioFilterEnabled, setScenarioFilterEnabled] = useState(false);
  const [pageTitle, setPageTitle] = useState(pickFunSelectTitle);

  useFocusEffect(
    useCallback(() => {
      setPageTitle(pickFunSelectTitle());
    }, [])
  );

  const pickBtnScale = useSharedValue(1);
  const pickBtnAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: pickBtnScale.value }] }));

  const minAiCutoffs = useMemo(() => slotsToCutoffs(aiSlot1, aiSlot2), [aiSlot1, aiSlot2]);
  const hydratedRef = useRef(false);
  const isResettingRef = useRef(false);
  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'random');

  const PRICE_LEVELS = [
    { key: 'PRICE_LEVEL_INEXPENSIVE', label: '$' },
    { key: 'PRICE_LEVEL_MODERATE', label: '$$' },
    { key: 'PRICE_LEVEL_EXPENSIVE', label: '$$$' },
    { key: 'PRICE_LEVEL_VERY_EXPENSIVE', label: '$$$$' },
  ];
  const RATING_OPTS = [0, 3.0, 3.5, 4.0, 4.5];

  const togglePrice = (key: string) => {
    const next = new Set(selectedPrices);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedPrices(next);
  };

  const toggleCuisine = (key: string) => {
    const next = new Set(selectedCuisines);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedCuisines(next);
  };

  const applyDefaultFilters = useCallback((all: any[]) => {
    setFilter('');
    setOpenOnly(true);
    setSelectedPrices(new Set());
    setMinRating(0);
    setSelectedCuisines(new Set());
    setSortBy(paramScenario ? getScenarioPreferredSort(paramScenario) : 'distance');
    setAiSlot1({ key: null, min: 0 });
    setAiSlot2({ key: null, min: 0 });
    if (paramScenario) {
      setScenarioKey(paramScenario);
      setScenarioFilterEnabled(true);
    } else {
      setScenarioKey(null);
      setScenarioFilterEnabled(false);
    }
    const openIds = all.filter((x: any) => isOpenNow(x)).map((x: any) => x.id);
    setSelected(new Set(openIds));
    setShowFilters(false);
  }, [paramScenario]);

  const resetFilters = useCallback(async () => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    try {
      await clearRandomPickerState();
      applyDefaultFilters(allResults);
    } finally {
      isResettingRef.current = false;
    }
  }, [allResults, applyDefaultFilters]);

  const handleBack = useCallback(() => {
    void resetFilters().finally(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/(home)');
    });
  }, [resetFilters, router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const type = e.data.action.type;
      if (type === 'GO_BACK' || type === 'POP') {
        void clearRandomPickerState();
      }
    });
    return unsub;
  }, [navigation]);

  const activeFilterCount =
    (openOnly ? 1 : 0) +
    (selectedPrices.size > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (selectedCuisines.size > 0 ? 1 : 0) +
    (scenarioFilterEnabled && scenarioKey ? 1 : 0) +
    (Object.values(minAiCutoffs).filter((v) => v > 0).length);

  const loadResults = useCallback(async (r?: number, isRefresh = false) => {
    const searchRadius = r ?? radiusRef.current;
    if (!isRefresh) setIsLoading(true);
    setErrorMsg(null);
    startGpsPhase();
    try {
      const coords = await getLocation(isRefresh);
      if (!coords) {
        setErrorMsg(t('random.locationError'));
        setIsLoading(false);
        return;
      }
      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        searchRadius,
        onOrchestratorProgress,
        { onAiReady: (enriched) => {
          setAllResults(enriched);
          replaceCurrentRestaurantIfInList(enriched);
        } }
      );
      setAllResults(all);

        const saved = await getRandomPickerState();
        if (saved && saved.v === 1) {
          setFilter(saved.filter);
          setOpenOnly(saved.openOnly);
          setSelectedPrices(new Set(saved.selectedPrices));
          setMinRating(saved.minRating);
          setSelectedCuisines(new Set(saved.selectedCuisines));
          if (paramScenario) {
            setSortBy(getScenarioPreferredSort(paramScenario));
          } else {
            setSortBy(isRandomSortBy(saved.sortBy) ? saved.sortBy : 'distance');
          }
          const [s1, s2] = cutoffsToSlots(mergeRandomAiCutoffs(saved.minAiCutoffs));
          setAiSlot1(s1);
          setAiSlot2(s2);
          if (paramScenario) {
            setScenarioKey(paramScenario);
            setScenarioFilterEnabled(true);
          } else {
            const sk = normalizeScenarioKey(saved.scenarioKey);
            if (sk) {
              setScenarioKey(sk);
              setScenarioFilterEnabled(saved.scenarioFilterEnabled !== false);
            }
          }
        }

        const allowed = new Set(all.map((x: any) => x.id));
        if (saved?.selectedIds?.length) {
          const nextSel = new Set(saved.selectedIds.filter((id) => allowed.has(id)));
          if (nextSel.size > 0) {
            setSelected(nextSel);
          } else {
            const initialSelected = all.filter((x: any) => isOpenNow(x));
            setSelected(new Set(initialSelected.map((x: any) => x.id)));
          }
        } else {
          const initialSelected = all.filter((x: any) => isOpenNow(x));
          setSelected(new Set(initialSelected.map((x: any) => x.id)));
        }
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      if (isRestaurantFetchError(e)) {
        if (__DEV__) console.warn('[restaurants]', e.message, e.cause);
        setErrorMsg(e.message);
        return;
      }
      console.error(e);
      setErrorMsg(t('random.loadError'));
    } finally {
      snapProgressComplete();
      setIsLoading(false);
      hydratedRef.current = true;
      setOpenCheckEpoch((e) => e + 1);
    }
  }, [onOrchestratorProgress, paramScenario, startFetchPhase, startGpsPhase, snapProgressComplete, t]);

  useEffect(() => {
    void loadResults(DEFAULT_SEARCH_RADIUS_METERS);
  }, [loadResults]);

  useFocusEffect(
    useCallback(() => {
      setRadius(DEFAULT_SEARCH_RADIUS_METERS);
      radiusRef.current = DEFAULT_SEARCH_RADIUS_METERS;
      pickBtnScale.value = 1;
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      void loadResults(DEFAULT_SEARCH_RADIUS_METERS);
    }, [loadResults, pickBtnScale])
  );

  useEffect(() => {
    if (!paramScenario) return;
    setScenarioKey(paramScenario);
    setScenarioFilterEnabled(true);
    setSortBy(getScenarioPreferredSort(paramScenario));
  }, [paramScenario]);

  useEffect(() => {
    return onRandomPickerReset(() => {
      void resetFilters();
    });
  }, [resetFilters]);

  useEffect(() => {
    if (!hydratedRef.current || isLoading || errorMsg) return;
    saveRandomPickerState({
      v: 1,
      filter,
      openOnly,
      selectedPrices: Array.from(selectedPrices),
      minRating,
      selectedCuisines: Array.from(selectedCuisines),
      sortBy,
      minAiCutoffs: minAiCutoffs,
      selectedIds: Array.from(selected),
      scenarioKey,
      scenarioFilterEnabled,
    });
  }, [filter, openOnly, selectedPrices, minRating, selectedCuisines, sortBy, minAiCutoffs, selected, isLoading, errorMsg, scenarioKey, scenarioFilterEnabled]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResults(radius, true);
    setRefreshing(false);
  };

  const changeRadius = (val: number) => {
    setRadius(val);
    setShowRadius(false);
    loadResults(val);
  };

  const filtered = allResults.filter(r => {
    if (!((r.displayName?.text || '').toLowerCase().includes(filter.toLowerCase()))) return false;
    if (openOnly) {
      if (!isOpenNow(r)) return false;
    }
    if (selectedPrices.size > 0 && r.priceLevel && !selectedPrices.has(r.priceLevel)) return false;
    if (minRating > 0 && (!r.rating || r.rating < minRating)) return false;
    if (selectedCuisines.size > 0) {
      const pType = r.primaryType;
      const tTypes = r.types || [];
        const hasMatch = Array.from(selectedCuisines).some(cuisineKey => {
        if (cuisineKey === 'dessert') return placeOffersSweets(r);
        const mappedTypes = CUISINE_TYPE_MAP[cuisineKey] || [];
        return mappedTypes.some(t => pType === t || tTypes.includes(t));
      });
      if (!hasMatch) return false;
    }
    if (scenarioFilterEnabled && scenarioKey && !restaurantMatchesScenario(r, scenarioKey)) {
      return false;
    }
    if (!passesAiCutoffs(r, minAiCutoffs)) return false;
    return true;
  }).sort((a, b) => compareRestaurantsBySort(a, b, sortBy));

  const allSelectedInView = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  const toggleSelectAll = () => {
    if (allSelectedInView) {
      const next = new Set(selected);
      filtered.forEach(r => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach(r => next.add(r.id));
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const navigateToResult = useCallback(() => {
    router.push('/random-result');
  }, [router]);

  const pickOne = () => {
    const pool = filtered.filter(r => selected.has(r.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCurrentRestaurant(pick);
    pickBtnScale.value = 1;
    pickBtnScale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 350 }),
      withSpring(1.0, { damping: 10, stiffness: 300 })
    );
    setTimeout(() => {
      navigateToResult();
    }, 150);
  };

  const selectedCount = filtered.filter(r => selected.has(r.id)).length;

  const screenBody = (
    <>
    <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <ReAnimated.View entering={FadeInDown.duration(350).springify()} style={styles.topChrome}>
        <View style={styles.header}>
          <AnimatedPressable
            onPress={handleBack}
            style={[styles.backBtn, { backgroundColor: tc.glass, borderColor: tc.glassBorder, borderWidth: 1 }]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </AnimatedPressable>
          {neonUi ? (
            <NeonGradientTitle text={pageTitle} width={SCREEN_WIDTH - 120} fontSize={20} />
          ) : (
            <Text style={[styles.title, { color: theme.pageTitleColor }]} numberOfLines={1}>
              {pageTitle}
            </Text>
          )}
          <View style={{ width: 40 }} />
        </View>

        {/* Search + Radius bar */}
        <View style={styles.toolRow}>
          <View style={[styles.searchBox, { backgroundColor: tc.glass, borderColor: tc.glassBorder, borderWidth: 1 }]}>
            <Ionicons name="search-outline" size={14} color={theme.subtext} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={t('random.filterPlaceholder')}
              placeholderTextColor={theme.subtext}
              value={filter}
              onChangeText={setFilter}
            />
            {filter.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('')}>
                <Ionicons name="close-circle" size={16} color={theme.subtext} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.radiusChip, { backgroundColor: tc.glass, borderColor: tc.glassBorder, borderWidth: 1 }]}
            onPress={() => {
              setShowRadius(!showRadius);
              if (!showRadius) setShowFilters(false);
            }}
          >
            <Ionicons name="location" size={12} color={theme.accent} />
            <Text style={[styles.radiusChipText, { color: theme.text }]}>{formatLabel(radius)}</Text>
            <Ionicons name={showRadius ? 'chevron-up' : 'chevron-down'} size={12} color={theme.subtext} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.radiusChip,
              { backgroundColor: tc.glass, borderColor: tc.glassBorder, borderWidth: 1 },
              activeFilterCount > 0 && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
            ]}
            onPress={() => {
              setShowFilters(!showFilters);
              if (!showFilters) setShowRadius(false);
            }}
          >
            <Ionicons
              name="options-outline"
              size={12}
              color={activeFilterCount > 0 ? tc.chipActiveText : theme.accent}
            />
            <Text
              style={[
                styles.radiusChipText,
                { color: theme.text },
                activeFilterCount > 0 && { color: tc.chipActiveText },
              ]}
            >
              {activeFilterCount > 0
                ? t('random.filtersCount', { count: activeFilterCount })
                : t('random.filters')}
            </Text>
          </TouchableOpacity>
        </View>

        {showRadius && (
          <View style={[styles.radiusPicker, { backgroundColor: tc.panelBg, borderColor: tc.panelBorder, borderWidth: 1 }]}>
            {SEARCH_RADIUS_OPTIONS_METERS.map(s => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.radiusOption,
                  { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                  radius === s && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                ]}
                onPress={() => changeRadius(s)}
              >
                <Text
                  style={[
                    styles.radiusOptionText,
                    { color: theme.subtext },
                    radius === s && { color: tc.chipActiveText },
                  ]}
                >
                  {formatLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        </ReAnimated.View>

        {showFilters && (
          <Pressable
            style={styles.filterDismissOverlay}
            onPress={() => setShowFilters(false)}
          />
        )}

        {showFilters && (
          <View style={[styles.filterPanel, { backgroundColor: tc.panelBg, borderColor: tc.panelBorder }]}>
            <View style={styles.filterPanelHeader}>
              <Text style={[styles.filterPanelTitle, { color: theme.text }]}>{t('random.filters')}</Text>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.filterCloseBtn}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.quickFiltersBlock}>
              <View style={styles.quickFilterTogglesRow}>
                <TouchableOpacity
                  style={[
                    styles.quickFilterToggle,
                    { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                    openOnly && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                  ]}
                  onPress={() => setOpenOnly((v) => !v)}
                  accessibilityLabel={t('random.a11yOpenNow')}
                >
                  <Ionicons
                    name={openOnly ? 'checkmark-circle' : 'ellipse-outline'}
                    size={15}
                    color={openOnly ? tc.chipActiveText : theme.subtext}
                  />
                  <Text
                    style={[
                      styles.quickFilterToggleText,
                      { color: theme.subtext },
                      openOnly && { color: tc.chipActiveText },
                    ]}
                  >
                    {t('random.openNow')}
                  </Text>
                </TouchableOpacity>
                {scenarioKey ? (
                  <TouchableOpacity
                    style={[
                      styles.quickFilterToggle,
                      { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                      scenarioFilterEnabled && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                    ]}
                    onPress={() => setScenarioFilterEnabled((v) => !v)}
                    accessibilityLabel={t('random.a11yScenarioVibe')}
                  >
                    <Ionicons
                      name={scenarioFilterEnabled ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={scenarioFilterEnabled ? tc.chipActiveText : theme.subtext}
                    />
                    <Text
                      style={[
                        styles.quickFilterToggleText,
                        { color: theme.subtext },
                        scenarioFilterEnabled && { color: tc.chipActiveText },
                      ]}
                      numberOfLines={1}
                    >
                      {t('random.vibeFilter', { scenario: tScenarioLabel(scenarioKey) })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.quickFilterRow}>
                <Text style={[styles.quickFilterRowLabel, { color: theme.subtext }]}>{t('random.price')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickFilterPillsRow}
                >
                  <TouchableOpacity
                    style={[
                      styles.quickFilterPill,
                      { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                      selectedPrices.size === 0 && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                    ]}
                    onPress={() => setSelectedPrices(new Set())}
                  >
                    <Text
                      style={[
                        styles.quickFilterPillText,
                        { color: theme.subtext },
                        selectedPrices.size === 0 && { color: tc.chipActiveText },
                      ]}
                    >
                      {t('random.any')}
                    </Text>
                  </TouchableOpacity>
                  {PRICE_LEVELS.map(p => (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.quickFilterPill,
                        { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                        selectedPrices.has(p.key) && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                      ]}
                      onPress={() => togglePrice(p.key)}
                    >
                      <Text
                        style={[
                          styles.quickFilterPillText,
                          { color: theme.subtext },
                          selectedPrices.has(p.key) && { color: tc.chipActiveText },
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.quickFilterRow}>
                <Text style={[styles.quickFilterRowLabel, { color: theme.subtext }]}>{t('random.rating')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickFilterPillsRow}
                >
                  {RATING_OPTS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.quickFilterPill,
                        { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                        minRating === r && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                      ]}
                      onPress={() => setMinRating(r)}
                    >
                      <Text
                        style={[
                          styles.quickFilterPillText,
                          { color: theme.subtext },
                          minRating === r && { color: tc.chipActiveText },
                        ]}
                      >
                        {r === 0 ? t('random.any') : `${r}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <Text style={[styles.filterSubLabel, { color: theme.subtext }]}>{t('random.cuisines')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {Object.keys(CUISINE_TYPE_MAP).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.filterPill,
                    { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                    selectedCuisines.has(key) && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                  ]}
                  onPress={() => toggleCuisine(key)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: theme.subtext },
                      selectedCuisines.has(key) && { color: tc.chipActiveText },
                    ]}
                  >
                    {tCuisineLabel(key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterSubLabel, { color: theme.subtext }]}>{t('random.sortBy')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {SORT_OPTIONS.map(({ key }) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.filterPill,
                    { borderColor: tc.chipBorder, backgroundColor: tc.chipBg },
                    sortBy === key && { backgroundColor: tc.chipActiveBg, borderColor: tc.chipActiveBg },
                  ]}
                  onPress={() => setSortBy(key)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: theme.subtext },
                      sortBy === key && { color: tc.chipActiveText },
                    ]}
                  >
                    {tSortLabel(key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterSubLabel, { color: theme.subtext }]}>{t('random.extraCutoffs')}</Text>
            {[1, 2].map((slotNum) => {
              const slot = slotNum === 1 ? aiSlot1 : aiSlot2;
              const setSlot = slotNum === 1 ? setAiSlot1 : setAiSlot2;
              const maxScore = slot.key == null ? 5 : metricScale(slot.key) === 'ten' ? 10 : 5;
              const categoryLabel =
                slot.key == null ? t('random.metric') : tScoreLabel(slot.key);
              return (
                <View key={slotNum} style={styles.aiFilterBlock}>
                  <TouchableOpacity
                    style={[styles.aiCategoryField, { backgroundColor: tc.chipBg, borderColor: tc.chipBorder }]}
                    onPress={() => setCategoryModal(slotNum as 1 | 2)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.aiCategoryFieldText, { color: theme.text }]} numberOfLines={1}>
                      {categoryLabel}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={theme.subtext} />
                  </TouchableOpacity>
                  {slot.key != null ? (
                    <View style={styles.aiScoreSliderRow}>
                      <Slider
                        style={styles.aiScoreSlider}
                        minimumValue={0}
                        maximumValue={maxScore}
                        step={1}
                        value={slot.min}
                        onValueChange={(v) =>
                          setSlot((prev) => ({ ...prev, min: Math.round(v) }))
                        }
                        minimumTrackTintColor={tc.sliderMin}
                        maximumTrackTintColor={tc.chipBorder}
                        thumbTintColor={theme.text}
                      />
                      <Text style={[styles.aiScoreSliderValue, { color: theme.text }]}>
                        {slot.min === 0 ? t('random.any') : `${slot.min}+`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <ReAnimated.View entering={FadeInUp.delay(120).duration(400).springify()} style={styles.mainContent}>
        {/* Select all row */}
        {!isLoading && !errorMsg && allResults.length > 0 && (
          <View style={styles.selectAllRow}>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>
              {t('random.matchingCount', { count: filtered.length })}
            </Text>
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: allSelectedInView ? theme.accent : tc.chipBorder },
                  allSelectedInView && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                {allSelectedInView && <Ionicons name="checkmark" size={14} color={tc.accentOn} />}
              </View>
              <Text style={[styles.selectAllText, { color: theme.subtext }]}>
                {allSelectedInView ? t('common.deselectAll') : t('common.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <RestaurantLoadingProgressBar stageLabel={loadingStage} progress={loadingProgress} />
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Ionicons name="location-outline" size={64} color={theme.subtext} />
            <Text style={[styles.errorText, { color: theme.subtext }]}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: theme.accent }]}
              onPress={() => loadResults()}
            >
              <Text style={[styles.retryText, { color: tc.accentOn }]}>{t('common.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        ) : allResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={64} color={theme.subtext} />
            <Text style={[styles.errorText, { color: theme.subtext }]}>
              {t('random.noResultsInRadius', { radius: formatLabel(radius) })}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: theme.accent }]}
              onPress={() => setShowRadius(true)}
            >
              <Text style={[styles.retryText, { color: tc.accentOn }]}>{t('random.expandRadius')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            extraData={openCheckEpoch}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <RestaurantRow
                item={item}
                selected={selected.has(item.id)}
                onOpenDetail={() => {
                  setCurrentRestaurant(item);
                  router.push('/random-result');
                }}
                onToggleSelect={() => toggleOne(item.id)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
            }
            ListFooterComponent={<View style={{ height: 120 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
        </ReAnimated.View>

        {/* Floating Pick One button */}
        {!isLoading && selectedCount > 0 && (
          <ReAnimated.View
            entering={FadeInUp.delay(200).springify()}
            style={[
              styles.pickBtn,
              neonUi && {
                shadowColor: NEON_CYAN,
                shadowOpacity: 0.55,
                shadowRadius: 14,
              },
            ]}
          >
            <ReAnimated.View style={pickBtnAnimStyle}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={pickOne}
                animated={false}
              >
                <LinearGradient
                  colors={tc.pickGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.pickBtnGradient}
                >
                  <Ionicons name="shuffle" size={20} color={neonUi ? '#000000' : tc.accentOn} />
                  <Text style={[styles.pickBtnText, { color: neonUi ? '#000000' : tc.accentOn }]}>
                    {t('random.pickOne', { count: selectedCount })}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ReAnimated.View>
          </ReAnimated.View>
        )}
      </SafeAreaView>

      <Modal
        visible={categoryModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModal(null)}
      >
        <View style={styles.categoryModalRoot}>
          <TouchableOpacity
            style={styles.categoryModalBackdrop}
            activeOpacity={1}
            onPress={() => setCategoryModal(null)}
          />
          <View style={[styles.categoryModalSheet, { backgroundColor: tc.modalBg, borderColor: tc.modalBorder }]}>
            <Text style={[styles.categoryModalTitle, { color: theme.text }]}>{t('random.aiMetric')}</Text>
            <ScrollView style={styles.categoryModalList} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.categoryModalOption, { borderBottomColor: tc.chipBorder }]}
                onPress={() => {
                  if (categoryModal === 1) setAiSlot1({ key: null, min: 0 });
                  else if (categoryModal === 2) setAiSlot2({ key: null, min: 0 });
                  setCategoryModal(null);
                }}
              >
                <Text style={[styles.categoryModalOptionText, { color: theme.text }]}>{t('random.none')}</Text>
              </TouchableOpacity>
              {AI_METRICS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.categoryModalOption, { borderBottomColor: tc.chipBorder }]}
                  onPress={() => {
                    if (categoryModal === 1) {
                      if (m.key === aiSlot2.key) setAiSlot2({ key: null, min: 0 });
                      setAiSlot1({ key: m.key, min: 0 });
                    } else if (categoryModal === 2) {
                      if (m.key === aiSlot1.key) setAiSlot1({ key: null, min: 0 });
                      setAiSlot2({ key: m.key, min: 0 });
                    }
                    setCategoryModal(null);
                  }}
                >
                  <Text style={[styles.categoryModalOptionText, { color: theme.text }]}>{tScoreLabel(m.key)}</Text>
                  <Text style={[styles.categoryModalScaleHint, { color: theme.subtext }]}>
                    {m.scale === 'ten' ? t('random.scaleTen') : t('random.scaleFive')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );

  return neonUi ? (
    <View style={[styles.bg, { backgroundColor: tc.pageBg }]}>{screenBody}</View>
  ) : (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.bg}
    >
      {screenBody}
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, position: 'relative' },
  topChrome: { zIndex: 7 },
  mainContent: { flex: 1 },
  filterDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  filterPanel: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 18,
    padding: 14, borderWidth: 1,
    gap: 10, zIndex: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },

  toolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 6,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  radiusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  radiusChipText: { fontSize: 13, fontWeight: '600' },

  radiusPicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 16, padding: 12,
  },
  radiusOption: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1,
  },
  radiusOptionText: { fontSize: 13, fontWeight: '600' },

  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 6,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 13, fontWeight: '600' },

  subtitle: { fontSize: 13, marginBottom: 10 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16,
    marginBottom: 10, padding: 10,
    borderWidth: 1,
  },
  rowMainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  rowTextCol: { flex: 1, minWidth: 0 },
  thumbWrap: { width: 52, height: 52, borderRadius: 11, overflow: 'hidden' },
  thumb: { width: 52, height: 52 },
  skeletonThumb: {
    width: 52, height: 52, borderRadius: 11,
  },

  rowName: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 7,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1,
  },
  metaText: { fontSize: 10 },
  rowPlateboundScore: { fontSize: 10, fontWeight: '800' },

  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  errorText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  retryText: { fontWeight: '700', fontSize: 15 },

  // Floating Pick button
  pickBtn: {
    position: 'absolute', bottom: 28, right: 20,
    borderRadius: 30, zIndex: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  pickBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30,
  },
  pickBtnText: { fontSize: 16, fontWeight: '800' },

  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  filterPanelTitle: { fontSize: 17, fontWeight: '800' },
  filterCloseBtn: { padding: 2 },
  quickFiltersBlock: { gap: 8 },
  quickFilterTogglesRow: { flexDirection: 'row', gap: 8 },
  quickFilterToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickFilterToggleText: { flex: 1, fontSize: 12, fontWeight: '700' },
  quickFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickFilterRowLabel: {
    width: 44,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  quickFilterPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  quickFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickFilterPillText: { fontSize: 12, fontWeight: '700' },
  aiFilterBlock: { marginBottom: 4, gap: 8 },
  aiCategoryField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  aiCategoryFieldText: { flex: 1, fontSize: 13, fontWeight: '700' },
  aiScoreSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiScoreSlider: { flex: 1, height: 32 },
  aiScoreSliderValue: {
    minWidth: 40,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  categoryModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  categoryModalSheet: {
    width: '86%',
    maxHeight: '72%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    zIndex: 2,
  },
  categoryModalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  categoryModalList: { maxHeight: 420 },
  categoryModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryModalOptionText: { fontSize: 15, fontWeight: '600' },
  categoryModalScaleHint: { fontSize: 12, fontWeight: '600' },
  filterSubLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  filterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 13, fontWeight: '600' },
});
