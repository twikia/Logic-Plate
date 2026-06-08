import { useAppTheme } from '@/context/ThemeContext';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type ImportanceLevel,
  type RecommendationPrefsV1,
  type RecommendationWeights,
} from '@/core/recommendationTypes';
import { PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import { getRecommendationPrefs, saveRecommendationPrefs } from '@/core/recommendationPrefs';
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

const { width: SCREEN_W } = Dimensions.get('window');

const METRIC_PAGE_START = 0;
const METRIC_PAGE_COUNT = PRIORITY_METRIC_SCREENS.length;
const CUISINE_PAGE = METRIC_PAGE_START + METRIC_PAGE_COUNT;
const STEPS = CUISINE_PAGE + 1;

export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const listRef = useRef<FlatList>(null);
  const [page, setPage] = useState(0);

  const [weights, setWeights] = useState<RecommendationWeights>({ ...DEFAULT_WEIGHTS });
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>(['italian']);

  useEffect(() => {
    void getRecommendationPrefs().then(p => {
      setWeights({ ...p.weights });
      setFavoriteCuisines([...p.favoriteCuisines]);
    });
  }, []);

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
    const existing = await getRecommendationPrefs();
    const prefs: RecommendationPrefsV1 = {
      ...existing,
      v: 1,
      onboardingComplete: true,
      weights,
      favoriteCuisines: favoriteCuisines.length ? favoriteCuisines : [...DEFAULT_PREFS_V1.favoriteCuisines],
      openNowOnly: true,
    };
    await saveRecommendationPrefs(prefs);
    router.replace('/(tabs)' as any);
  }, [favoriteCuisines, router, weights]);

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
    if (index >= METRIC_PAGE_START && index < METRIC_PAGE_START + METRIC_PAGE_COUNT) {
      const screenIdx = index - METRIC_PAGE_START;
      const screen = PRIORITY_METRIC_SCREENS[screenIdx]!;
      return (
        <ScrollView
          style={{ width: SCREEN_W }}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: theme.text }]}>{screen.title}</Text>
          <Text style={[styles.sub, { color: theme.subtext }]}>{screen.subtitle}</Text>
          <PriorityMetricsPanel weights={weights} onWeightChange={setWeight} screenIndex={screenIdx} />
        </ScrollView>
      );
    }
    return (
      <View style={[styles.page, { width: SCREEN_W }]}>
        <Text style={[styles.title, { color: theme.text }]}>Cuisines you love</Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>
          Pick at least one — we still show other cuisines if they rank well.
        </Text>
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
