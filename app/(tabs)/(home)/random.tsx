import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AiOverview } from '../../../core/aiOverviewCache';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';
import { calculatePlateboundScore } from '../../../core/ratingCalculator';
import { getLocation } from '../../../core/locationCache';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '../../../core/restaurantOrchestrator';
import { getSearchRadius, setSearchRadius } from '../../../core/userSettings';
import { replaceCurrentRestaurantIfInList, setCurrentRestaurant } from '../../../core/currentSelection';
import {
  getScenarioPreferredSort,
  isScenarioKey,
  restaurantMatchesScenario,
  SCENARIO_LABELS,
  type ScenarioKey,
} from '../../../core/scenarioFilters';
import {
  DEFAULT_RANDOM_AI_CUTOFFS,
  getRandomPickerState,
  isRandomSortBy,
  mergeRandomAiCutoffs,
  saveRandomPickerState,
  type RandomAiCutoffKey,
  type RandomAiCutoffs,
  type RandomSortBy,
} from '../../../core/randomPickerState';
import {
  SORT_OPTIONS,
  compareRestaurantsBySort,
  getOverviewMetric,
} from '../../../core/restaurantSort';
import { RestaurantImage } from '../../../core/images';
import { placeOffersSweets } from '../../../core/placeSweets';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';

const CUISINE_TYPE_MAP: Record<string, string[]> = {
  italian: ['italian_restaurant'],
  mexican: ['mexican_restaurant'],
  japanese: ['japanese_restaurant'],
  chinese: ['chinese_restaurant'],
  american: ['american_restaurant', 'hamburger_restaurant'],
  indian: ['indian_restaurant'],
  thai: ['thai_restaurant'],
  mediterranean: ['mediterranean_restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  bars: ['bar'],
  smoothies: ['ice_cream_shop', 'juice_shop'],
  seafood: ['seafood_restaurant'],
  steakhouse: ['steak_house'],
  vegan: ['vegan_restaurant', 'vegetarian_restaurant'],
  pizza: ['pizza_restaurant'],
  dessert: [
    'bakery',
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

const RADIUS_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
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
    <Animated.View style={[styles.row, { opacity: pulse }]}>
      <View style={styles.skeletonThumb} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 15, width: '70%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 }} />
        <View style={{ height: 12, width: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }} />
      </View>
    </Animated.View>
  );
}

const AI_METRICS: { key: RandomAiCutoffKey; label: string; scale: 'five' | 'ten' }[] = [
  { key: 'taste', label: 'Taste', scale: 'five' },
  { key: 'valueForMoney', label: 'Value', scale: 'five' },
  { key: 'speed', label: 'Speed', scale: 'five' },
  { key: 'workoutRecovery', label: 'Workout recovery', scale: 'ten' },
  { key: 'munchy', label: 'Munchy', scale: 'five' },
  { key: 'protein', label: 'Protein', scale: 'five' },
  { key: 'calorie', label: 'Calorie fit', scale: 'five' },
  { key: 'dateWorthiness', label: 'Date worthy', scale: 'five' },
  { key: 'soloDiner', label: 'Solo diner', scale: 'five' },
  { key: 'energySustain', label: 'Energy sustain', scale: 'five' },
];

const FIVE_SCORE_OPTS = [0, 1, 2, 3, 4, 5] as const;
const TEN_SCORE_OPTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

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
  const { formatDistance } = useDistanceFormatter();

  const name = item.displayName?.text || 'Unknown';
  const ai = item.aiOverview as AiOverview | undefined | null;
  const distM = Math.round(item.distanceMeters ?? 0);
  const dist = formatDistance(distM);
  const price = formatPlacePriceLabel(item);
  const overall = calculatePlateboundScore(ai, item.rating, item.priceLevel);
  const healthNum = typeof ai?.healthScore === 'number' ? ai.healthScore : null;

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onOpenDetail}
        style={styles.rowMainTap}
      >
        <View style={styles.thumbWrap}>
          <RestaurantImage
            restaurantId={item.id}
            photos={item.photos || []}
            width={52}
            height={52}
            quality={200}
            loadDelay={400}
            borderRadius={11}
          />
        </View>

        <View style={styles.rowTextCol}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          <View style={styles.rowMeta}>
            {typeof item.rating === 'number' && item.rating > 0 ? (
              <View style={styles.metaPill}>
                <Ionicons name="star" size={9} color="#FBBF24" />
                <Text style={[styles.metaText, styles.rowMapsRating]}>{item.rating.toFixed(1)}</Text>
              </View>
            ) : null}
            <View style={styles.metaPill}>
              <Ionicons name="ribbon-outline" size={9} color="#A78BFA" />
              <Text style={styles.rowPlateboundScore}>{overall > 0 ? overall.toFixed(1) : '—'}</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="heart-outline" size={9} color="#4CD964" />
              <Text style={[styles.metaText, { color: '#4CD964' }]}>
                {healthNum != null ? `${healthNum.toFixed(1)}/10` : '—'}
              </Text>
            </View>
            {price ? (
              <View style={styles.metaPill}>
                <Text style={[styles.metaText, { color: '#F9A06F' }]}>{price}</Text>
              </View>
            ) : null}
            <View style={styles.metaPill}>
              <Ionicons name="navigate-outline" size={9} color="#F9A06F" />
              <Text style={styles.metaText}>{dist}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onToggleSelect}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.checkbox, selected && styles.checkboxSelected]}
      >
        {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RandomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scenario?: string | string[] }>();
  const paramScenario = useMemo((): ScenarioKey | null => {
    const raw = params.scenario;
    const s = Array.isArray(raw) ? raw[0] : raw;
    if (!isScenarioKey(s)) return null;
    return s;
  }, [params.scenario]);

  const [allResults, setAllResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [radius, setRadius] = useState(3000);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
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

  const minAiCutoffs = useMemo(() => slotsToCutoffs(aiSlot1, aiSlot2), [aiSlot1, aiSlot2]);
  const hydratedRef = useRef(false);
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
        setErrorMsg('Location access is needed to find nearby restaurants.\n\nEnable it in Settings → Privacy → Location.');
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
            const sk = saved.scenarioKey;
            if (isScenarioKey(sk)) {
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
      console.error(e);
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setErrorMsg(message);
    } finally {
      snapProgressComplete();
      setIsLoading(false);
      hydratedRef.current = true;
      setOpenCheckEpoch((e) => e + 1);
    }
  }, [onOrchestratorProgress, paramScenario, startFetchPhase, startGpsPhase, snapProgressComplete]);

  useEffect(() => {
    getSearchRadius().then(r => {
      setRadius(r);
      void loadResults(r);
    });
  }, [loadResults]);

  useEffect(() => {
    if (!paramScenario) return;
    setScenarioKey(paramScenario);
    setScenarioFilterEnabled(true);
    setSortBy(getScenarioPreferredSort(paramScenario));
  }, [paramScenario]);

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

  const changeRadius = async (val: number) => {
    setRadius(val);
    await setSearchRadius(val);
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

  const pickOne = () => {
    const pool = filtered.filter(r => selected.has(r.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCurrentRestaurant(pick);
    router.push('/random-result');
  };

  const selectedCount = filtered.filter(r => selected.has(r.id)).length;

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </AnimatedPressable>
          <Text style={styles.title}>Select</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search + Radius bar */}
        <View style={styles.toolRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={14} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter restaurants…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={filter}
              onChangeText={setFilter}
            />
            {filter.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            style={styles.radiusChip} 
            onPress={() => {
              setShowRadius(!showRadius);
              if (!showRadius) setShowFilters(false);
            }}
          >
            <Ionicons name="location" size={12} color="#F9A06F" />
            <Text style={styles.radiusChipText}>{formatLabel(radius)}</Text>
            <Ionicons name={showRadius ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.radiusChip, activeFilterCount > 0 && styles.filterChipActive]}
            onPress={() => {
              setShowFilters(!showFilters);
              if (!showFilters) setShowRadius(false);
            }}
          >
            <Ionicons name="options-outline" size={12} color={activeFilterCount > 0 ? '#FFFFFF' : '#F9A06F'} />
            <Text style={[styles.radiusChipText, activeFilterCount > 0 && { color: '#FFFFFF' }]}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {showRadius && (
          <View style={styles.radiusPicker}>
            {RADIUS_STEPS.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.radiusOption, radius === s && styles.radiusOptionActive]}
                onPress={() => changeRadius(s)}
              >
                <Text style={[styles.radiusOptionText, radius === s && styles.radiusOptionTextActive]}>
                  {formatLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showFilters && (
          <View style={styles.filterPanel}>
            <View style={styles.filterPanelHeader}>
              <Text style={styles.filterPanelTitle}>Filters</Text>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.filterCloseBtn}
              >
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterDuoRow}>
              <View style={styles.filterDuoCell}>
                <Text style={styles.filterLabel}>On</Text>
                <TouchableOpacity
                  style={[styles.filterToggle, openOnly && styles.filterToggleOn]}
                  onPress={() => setOpenOnly((v) => !v)}
                >
                  {openOnly && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                  <Text style={[styles.filterToggleText, openOnly && { color: '#FFFFFF' }]}>
                    {openOnly ? 'Open' : 'Any hours'}
                  </Text>
                </TouchableOpacity>
              </View>
              {scenarioKey ? (
                <View style={styles.filterDuoCell}>
                  <Text style={styles.filterLabel}>Vibe</Text>
                  <TouchableOpacity
                    style={[styles.filterToggle, scenarioFilterEnabled && styles.filterToggleOn]}
                    onPress={() => setScenarioFilterEnabled((v) => !v)}
                  >
                    {scenarioFilterEnabled && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    <Text
                      style={[styles.filterToggleText, scenarioFilterEnabled && { color: '#FFFFFF' }]}
                      numberOfLines={1}
                    >
                      {SCENARIO_LABELS[scenarioKey]}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <Text style={styles.filterSubLabel}>Price</Text>
            <View style={styles.filterPills}>
              <TouchableOpacity
                style={[styles.filterPill, selectedPrices.size === 0 && styles.filterPillActive]}
                onPress={() => setSelectedPrices(new Set())}
              >
                <Text style={[styles.filterPillText, selectedPrices.size === 0 && styles.filterPillTextActive]}>Any</Text>
              </TouchableOpacity>
              {PRICE_LEVELS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterPill, selectedPrices.has(p.key) && styles.filterPillActive]}
                  onPress={() => togglePrice(p.key)}
                >
                  <Text style={[styles.filterPillText, selectedPrices.has(p.key) && styles.filterPillTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSubLabel}>Min Rating</Text>
            <View style={styles.filterPills}>
              {RATING_OPTS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterPill, minRating === r && styles.filterPillActive]}
                  onPress={() => setMinRating(r)}
                >
                  <Text style={[styles.filterPillText, minRating === r && styles.filterPillTextActive]}>
                    {r === 0 ? 'Any' : `${r}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSubLabel}>Cuisines</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {Object.keys(CUISINE_TYPE_MAP).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterPill, selectedCuisines.has(key) && styles.filterPillActive]}
                  onPress={() => toggleCuisine(key)}
                >
                  <Text style={[styles.filterPillText, selectedCuisines.has(key) && styles.filterPillTextActive]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterSubLabel}>Sort By</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {SORT_OPTIONS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterPill, sortBy === key && styles.filterPillActive]}
                  onPress={() => setSortBy(key)}
                >
                  <Text style={[styles.filterPillText, sortBy === key && styles.filterPillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterSubLabel}>Minimum AI (2 filters)</Text>
            {[1, 2].map((slotNum) => {
              const slot = slotNum === 1 ? aiSlot1 : aiSlot2;
              const setSlot = slotNum === 1 ? setAiSlot1 : setAiSlot2;
              const opts = slot.key == null ? [] : metricScale(slot.key) === 'ten' ? [...TEN_SCORE_OPTS] : [...FIVE_SCORE_OPTS];
              const categoryLabel =
                slot.key == null ? 'Metric' : AI_METRICS.find((m) => m.key === slot.key)?.label ?? 'Metric';
              return (
                <View key={slotNum} style={styles.aiFilterBlock}>
                  <View style={styles.aiFilterRow}>
                    <TouchableOpacity
                      style={styles.aiCategoryField}
                      onPress={() => setCategoryModal(slotNum as 1 | 2)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.aiCategoryFieldText} numberOfLines={1}>
                        {categoryLabel}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.45)" />
                    </TouchableOpacity>
                    {slot.key != null ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.aiScoreStrip}
                        contentContainerStyle={styles.aiScorePills}
                      >
                        {opts.map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.filterPill, styles.aiScorePill, slot.min === opt && styles.filterPillActive]}
                            onPress={() => setSlot((prev) => ({ ...prev, min: opt }))}
                          >
                            <Text style={[styles.filterPillText, slot.min === opt && styles.filterPillTextActive]}>
                              {opt === 0 ? 'Any' : `${opt}+`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={styles.aiScorePlaceholder} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Select all row */}
        {!isLoading && !errorMsg && allResults.length > 0 && (
          <View style={styles.selectAllRow}>
            <Text style={styles.subtitle}>{filtered.length} restaurants matching filters</Text>
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
              <View style={[styles.checkbox, allSelectedInView && styles.checkboxSelected]}>
                {allSelectedInView && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.selectAllText}>
                {allSelectedInView ? 'Deselect All' : 'Select All'}
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
            <Ionicons name="location-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadResults()}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : allResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>No restaurants found within {formatLabel(radius)}.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setShowRadius(true)}>
              <Text style={styles.retryText}>Expand Radius</Text>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
            ListFooterComponent={<View style={{ height: 120 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Floating Pick One button */}
        {!isLoading && selectedCount > 0 && (
          <TouchableOpacity
            style={styles.pickBtn}
            activeOpacity={0.85}
            onPress={pickOne}
          >
            <LinearGradient
              colors={['#F97352', '#FF9A6F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pickBtnGradient}
            >
              <Ionicons name="shuffle" size={20} color="#FFFFFF" />
              <Text style={styles.pickBtnText}>Pick One  ({selectedCount})</Text>
            </LinearGradient>
          </TouchableOpacity>
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
          <View style={styles.categoryModalSheet}>
            <Text style={styles.categoryModalTitle}>AI metric</Text>
            <ScrollView style={styles.categoryModalList} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.categoryModalOption}
                onPress={() => {
                  if (categoryModal === 1) setAiSlot1({ key: null, min: 0 });
                  else if (categoryModal === 2) setAiSlot2({ key: null, min: 0 });
                  setCategoryModal(null);
                }}
              >
                <Text style={styles.categoryModalOptionText}>None</Text>
              </TouchableOpacity>
              {AI_METRICS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={styles.categoryModalOption}
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
                  <Text style={styles.categoryModalOptionText}>{m.label}</Text>
                  <Text style={styles.categoryModalScaleHint}>{m.scale === 'ten' ? '0–10' : '0–5'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },

  toolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 6,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#FFFFFF', padding: 0 },

  radiusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  radiusChipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  radiusPicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(30,15,30,0.7)', borderRadius: 16, padding: 12,
  },
  radiusOption: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  radiusOptionActive: { backgroundColor: '#F97352', borderColor: '#F97352' },
  radiusOptionText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  radiusOptionTextActive: { color: '#FFFFFF' },

  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 6,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  countText: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },

  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(30,15,30,0.55)', borderRadius: 16,
    marginBottom: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  rowTextCol: { flex: 1, minWidth: 0 },
  rowSelected: {
    borderColor: 'rgba(249,115,82,0.5)',
    backgroundColor: 'rgba(249,115,82,0.1)',
  },
  thumbWrap: { width: 52, height: 52, borderRadius: 11, overflow: 'hidden' },
  thumb: { width: 52, height: 52 },
  skeletonThumb: {
    width: 52, height: 52, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  rowName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 7,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metaText: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  rowMapsRating: { fontSize: 10, color: '#FBBF24', fontWeight: '700' },
  rowPlateboundScore: { fontSize: 10, color: '#C4B5FD', fontWeight: '800' },

  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#F97352', borderColor: '#F97352' },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  errorText: { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: '#F97352', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // Floating Pick button
  pickBtn: {
    position: 'absolute', bottom: 28, right: 20,
    borderRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  pickBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30,
  },
  pickBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  // Filter chip (active state)
  filterChipActive: { backgroundColor: '#F97352', borderColor: '#F97352' },

  // Filter panel
  filterPanel: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(30,15,30,0.75)', borderRadius: 18,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  filterPanelTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  filterCloseBtn: { padding: 2 },
  filterDuoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  filterDuoCell: { flex: 1, gap: 6 },
  aiFilterBlock: { marginBottom: 4 },
  aiFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiCategoryField: {
    width: '42%',
    maxWidth: 148,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  aiCategoryFieldText: { flex: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  aiScoreStrip: { flex: 1, minWidth: 0 },
  aiScorePlaceholder: { flex: 1, minHeight: 38 },
  aiScorePills: { flexDirection: 'row', flexWrap: 'nowrap', gap: 5, alignItems: 'center', paddingVertical: 2 },
  aiScorePill: { paddingHorizontal: 9, paddingVertical: 5 },
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
    backgroundColor: 'rgba(28,14,32,0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    zIndex: 2,
  },
  categoryModalTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 10 },
  categoryModalList: { maxHeight: 420 },
  categoryModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  categoryModalOptionText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },
  categoryModalScaleHint: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  filterSubLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginTop: 4 },
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterToggleOn: { backgroundColor: '#4CD964', borderColor: '#4CD964' },
  filterToggleText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  filterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  filterPillActive: { backgroundColor: '#F97352', borderColor: '#F97352' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  filterPillTextActive: { color: '#FFFFFF' },
});
