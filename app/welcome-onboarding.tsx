import { useAppTheme } from '@/context/ThemeContext';
import {
  DEFAULT_WEIGHTS,
  type ImportanceLevel,
  type RecommendationWeights,
} from '@/core/recommendationTypes';
import { ImportanceLevelPicker, PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { CUISINE_FIT_METRIC, PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { CuisineRankGrid } from '@/components/CuisineRankGrid';
import {
  getRecommendationPrefs,
  isRecommendationOnboardingRequired,
  markOnboardingComplete,
} from '@/core/recommendationPrefs';
import { BackButton } from '@/components/ui/BackButton';
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
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>([]);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const needsOnboarding = await isRecommendationOnboardingRequired();
      if (cancelled) return;

      if (!needsOnboarding) {
        router.replace('/(tabs)' as any);
        return;
      }

      const p = await getRecommendationPrefs();
      if (cancelled) return;

      setWeights({ ...p.weights });
      setFavoriteCuisines([...p.favoriteCuisines]);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const finish = useCallback(async () => {
    await markOnboardingComplete({
      v: 1,
      weights,
      favoriteCuisines,
      openNowOnly: true,
    });
    router.replace('/(tabs)' as any);
  }, [favoriteCuisines, router, weights]);

  const setWeight = (key: keyof RecommendationWeights, level: ImportanceLevel) => {
    setWeights(w => ({ ...w, [key]: level }));
  };

  const goNext = () => {
    if (page < STEPS - 1) {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      void finish();
    }
  };

  const canGoBack = page > 0 || router.canGoBack();

  const goBack = () => {
    if (page > 0) {
      listRef.current?.scrollToIndex({ index: page - 1, animated: true });
    } else if (router.canGoBack()) {
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
    return (
      <ScrollView
        style={{ width: SCREEN_W }}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <ImportanceLevelPicker
          metric={CUISINE_FIT_METRIC}
          value={weights.cuisine}
          onChange={level => setWeight('cuisine', level)}
        />
        <Text style={[styles.title, styles.cuisineSectionTitle, { color: theme.text }]}>Rank your top cuisines</Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>
          Optional: tap up to 5 favorites in order — #1 is your top pick. Skip any you are not sure about; we still
          surface great matches either way.
        </Text>
        <CuisineRankGrid
          ranked={favoriteCuisines}
          onChange={setFavoriteCuisines}
          accent={theme.accent}
          textColor={theme.text}
        />
      </ScrollView>
    );
  };

  if (!ready) {
    return <View style={[styles.root, { backgroundColor: theme.cardBackground }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <BackButton onPress={goBack} disabled={!canGoBack} size={26} />
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
          <Pressable onPress={goNext} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>
              {page === STEPS - 1 ? 'Start exploring' : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={theme.accentOnColor ?? '#FFFFFF'} />
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
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  page: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  cuisineSectionTitle: { marginTop: 8 },
  sub: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  footer: { padding: 20 },
  primaryBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '800' },
});
