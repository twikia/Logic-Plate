import { useAppTheme } from '@/context/ThemeContext';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type DefaultGroupSize,
  type DefaultRadiusId,
  type DietaryFilterId,
  type ImportanceLevel,
  type RecommendationPrefsV1,
  type RecommendationWeights,
  radiusIdToMeters,
} from '@/core/recommendationTypes';
import { PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import { getRecommendationPrefs, saveRecommendationPrefs } from '@/core/recommendationPrefs';
import { setSearchRadius } from '@/core/userSettings';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

const { width: SCREEN_W } = Dimensions.get('window');

const GROUP_OPTIONS: { id: DefaultGroupSize; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'solo', label: 'Just me', icon: 'person' },
  { id: 'partner', label: 'Partner / date', icon: 'heart' },
  { id: 'small_group', label: 'Small group (3–4)', icon: 'people' },
  { id: 'big_group', label: 'Big group (5+)', icon: 'people' },
  { id: 'varies', label: 'It varies', icon: 'shuffle' },
];

const METRIC_PAGE_START = 1;
const METRIC_PAGE_COUNT = PRIORITY_METRIC_SCREENS.length;
const CUISINE_PAGE = METRIC_PAGE_START + METRIC_PAGE_COUNT + 2;

const DIETARY: { id: DietaryFilterId | 'none'; label: string }[] = [
  { id: 'none', label: 'No restrictions' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'gluten_free', label: 'Gluten-free options needed' },
  { id: 'dairy_free', label: 'Dairy-free options needed' },
  { id: 'nut_allergy', label: 'Nut allergy awareness needed' },
];

const RADIUS_OPTIONS: { id: DefaultRadiusId; label: string; sub: string }[] = [
  { id: 'walking', label: 'Walking distance', sub: 'Under ~10 min / 800m' },
  { id: 'short_drive', label: 'Short drive', sub: 'Under ~15 min / 3km' },
  { id: 'worth_trip', label: 'Worth the trip', sub: 'Under ~30 min / 8km' },
];

const STEPS = 8;

export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const listRef = useRef<FlatList>(null);
  const [page, setPage] = useState(0);

  const [defaultGroupSize, setDefaultGroupSize] = useState<DefaultGroupSize>('solo');
  const [weights, setWeights] = useState<RecommendationWeights>({ ...DEFAULT_WEIGHTS });
  const [dietaryFilters, setDietaryFilters] = useState<DietaryFilterId[]>([]);
  const [budgetCeiling, setBudgetCeiling] = useState(20);
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>(['italian']);
  const [defaultRadius, setDefaultRadius] = useState<DefaultRadiusId>('short_drive');

  useEffect(() => {
    void getRecommendationPrefs().then(p => {
      setDefaultGroupSize(p.defaultGroupSize);
      setWeights({ ...p.weights });
      setDietaryFilters([...p.dietaryFilters]);
      setBudgetCeiling(p.budgetCeiling);
      setFavoriteCuisines([...p.favoriteCuisines]);
      setDefaultRadius(p.defaultRadius);
    });
  }, []);

  const toggleDietary = (id: DietaryFilterId | 'none') => {
    if (id === 'none') {
      setDietaryFilters([]);
      return;
    }
    setDietaryFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return Array.from(next) as DietaryFilterId[];
    });
  };

  const toggleCuisine = (id: string) => {
    setFavoriteCuisines(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      const out = Array.from(s);
      return out.length ? out : prev;
    });
  };

  const finish = useCallback(async () => {
    const prefs: RecommendationPrefsV1 = {
      v: 1,
      onboardingComplete: true,
      defaultGroupSize,
      weights,
      dietaryFilters,
      budgetCeiling,
      favoriteCuisines: favoriteCuisines.length ? favoriteCuisines : [...DEFAULT_PREFS_V1.favoriteCuisines],
      defaultRadius,
      openNowOnly: DEFAULT_PREFS_V1.openNowOnly,
      minimumRatingThreshold: DEFAULT_PREFS_V1.minimumRatingThreshold,
      noveltyPressure: DEFAULT_PREFS_V1.noveltyPressure,
      penalizeRepeats: DEFAULT_PREFS_V1.penalizeRepeats,
      cuisineRepeatWindowDays: DEFAULT_PREFS_V1.cuisineRepeatWindowDays,
    };
    await saveRecommendationPrefs(prefs);
    await setSearchRadius(radiusIdToMeters(defaultRadius));
    router.replace('/(tabs)' as any);
  }, [
    budgetCeiling,
    defaultGroupSize,
    defaultRadius,
    dietaryFilters,
    favoriteCuisines,
    router,
    weights,
  ]);

  const setWeight = (key: keyof RecommendationWeights, level: ImportanceLevel) => {
    setWeights(w => ({ ...w, [key]: level }));
  };

  const goNext = () => {
    if (page < STEPS - 1) {
      if (page === CUISINE_PAGE && favoriteCuisines.length === 0) return;
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      void finish();
    }
  };

  const goBack = () => {
    if (page > 0) {
      listRef.current?.scrollToIndex({ index: page - 1, animated: true });
    } else {
      router.back();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    if (idx >= 0 && idx < STEPS && idx !== page) setPage(idx);
  };

  const renderPage = ({ index }: { index: number }) => {
    if (index === 0) {
      return (
        <View style={[styles.page, { width: SCREEN_W }]}>
          <Text style={[styles.title, { color: theme.text }]}>Who are you eating with most often?</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>We use this as the default when we pick for you.</Text>
          <View style={styles.cardCol}>
            {GROUP_OPTIONS.map(opt => (
              <Pressable
                key={opt.id}
                onPress={() => setDefaultGroupSize(opt.id)}
                style={[
                  styles.bigCard,
                  { borderColor: defaultGroupSize === opt.id ? theme.accent : 'rgba(255,255,255,0.12)' },
                  defaultGroupSize === opt.id && { backgroundColor: 'rgba(249,115,82,0.15)' },
                ]}
              >
                <Ionicons name={opt.icon} size={28} color={defaultGroupSize === opt.id ? theme.accent : theme.subtext} />
                <Text style={[styles.bigCardLabel, { color: theme.text }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }
    if (index >= METRIC_PAGE_START && index < METRIC_PAGE_START + METRIC_PAGE_COUNT) {
      const screenIdx = index - METRIC_PAGE_START;
      return (
        <ScrollView
          style={{ width: SCREEN_W }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <PriorityMetricsPanel weights={weights} onWeightChange={setWeight} screenIndex={screenIdx} />
        </ScrollView>
      );
    }
    if (index === METRIC_PAGE_START + METRIC_PAGE_COUNT) {
      return (
        <View style={[styles.page, { width: SCREEN_W }]}>
          <Text style={[styles.title, { color: theme.text }]}>Dietary needs</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>Hard filters — we will not show places that clash.</Text>
          <View style={styles.wrap}>
            {DIETARY.map(d => {
              const active = d.id === 'none' ? dietaryFilters.length === 0 : dietaryFilters.includes(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => toggleDietary(d.id)}
                  style={[
                    styles.chip,
                    { borderColor: active ? theme.accent : 'rgba(255,255,255,0.12)' },
                    active && { backgroundColor: 'rgba(249,115,82,0.12)' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    if (index === METRIC_PAGE_START + METRIC_PAGE_COUNT + 1) {
      return (
        <View style={[styles.page, { width: SCREEN_W }]}>
          <Text style={[styles.title, { color: theme.text }]}>Typical budget per meal</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>About how much you like to spend per person.</Text>
          <Text style={[styles.budgetBig, { color: theme.accent }]}>${Math.round(budgetCeiling)}</Text>
          <Slider
            minimumValue={5}
            maximumValue={100}
            step={1}
            value={budgetCeiling}
            onValueChange={setBudgetCeiling}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor="rgba(255,255,255,0.15)"
            thumbTintColor="#FFFFFF"
          />
          <Text style={[styles.rangeHint, { color: theme.subtext }]}>$5 — $100</Text>
        </View>
      );
    }
    if (index === CUISINE_PAGE) {
      return (
        <View style={[styles.page, { width: SCREEN_W }]}>
          <Text style={[styles.title, { color: theme.text }]}>Cuisines you love</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>Pick at least one — we still show other cuisines if they rank well.</Text>
          <View style={styles.cuisineGrid}>
            {TOP_CUISINE_TILES.map(t => {
              const on = favoriteCuisines.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggleCuisine(t.id)}
                  style={[
                    styles.cuisineTile,
                    { borderColor: on ? theme.accent : 'rgba(255,255,255,0.12)' },
                    on && { backgroundColor: 'rgba(249,115,82,0.12)' },
                  ]}
                >
                  <Text style={styles.cEmoji}>{t.emoji}</Text>
                  <Text style={[styles.cLabel, { color: theme.text }]} numberOfLines={2}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.page, { width: SCREEN_W }]}>
        <Text style={[styles.title, { color: theme.text }]}>How far are you willing to go?</Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>Default search radius — you can change it anytime.</Text>
        <View style={styles.cardCol}>
          {RADIUS_OPTIONS.map(r => (
            <Pressable
              key={r.id}
              onPress={() => setDefaultRadius(r.id)}
              style={[
                styles.radiusCard,
                { borderColor: defaultRadius === r.id ? theme.accent : 'rgba(255,255,255,0.12)' },
                defaultRadius === r.id && { backgroundColor: 'rgba(249,115,82,0.15)' },
              ]}
            >
              <Text style={[styles.bigCardLabel, { color: theme.text }]}>{r.label}</Text>
              <Text style={[styles.radiusSub, { color: theme.subtext }]}>{r.sub}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <Pressable onPress={goBack} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i === page ? theme.accent : 'rgba(255,255,255,0.2)' }]}
              />
            ))}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          ref={listRef}
          data={Array.from({ length: STEPS }, (_, i) => i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={i => String(i)}
          renderItem={({ index }) => renderPage({ index })}
          onMomentumScrollEnd={onScroll}
          getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={goNext}
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.accent },
              page === CUISINE_PAGE && favoriteCuisines.length === 0 && { opacity: 0.45 },
            ]}
            disabled={page === CUISINE_PAGE && favoriteCuisines.length === 0}
          >
            <Text style={styles.primaryBtnText}>{page === STEPS - 1 ? 'Start exploring' : 'Continue'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  navBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  page: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  cardCol: { gap: 10 },
  bigCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  radiusCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  bigCardLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  radiusSub: { fontSize: 12, marginTop: 4, flexBasis: '100%' },
  sliderBlock: { marginBottom: 4 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  sliderVal: { fontSize: 14, fontWeight: '800' },
  sliderHint: { fontSize: 11, marginBottom: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  budgetBig: { fontSize: 44, fontWeight: '900', textAlign: 'center', marginVertical: 12 },
  rangeHint: { textAlign: 'center', marginTop: 8 },
  cuisineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  cuisineTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
  },
  cEmoji: { fontSize: 28, marginBottom: 6 },
  cLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: { padding: 20 },
  primaryBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
