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
import { Pressable } from '@/components/ui/soundPressable';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { hapticMedium, hapticSuccess } from '@/core/haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');

const METRIC_PAGE_START = 0;
const METRIC_PAGE_COUNT = PRIORITY_METRIC_SCREENS.length;
const CUISINE_PAGE = METRIC_PAGE_START + METRIC_PAGE_COUNT;
const STEPS = CUISINE_PAGE + 1;

function AnimatedContinueButton({ onPress, text, theme }: { onPress: () => void; text: string; theme: any }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        animated={false}
        onPress={() => {
          scale.value = withSequence(
            withTiming(1.15, { duration: 120 }),
            withSpring(0.95, { damping: 5 }),
            withSpring(1, { damping: 8 })
          );
          onPress();
        }}
        style={[
          styles.primaryBtn,
          {
            backgroundColor: theme.accent,
            shadowColor: theme.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 8,
            borderWidth: 2,
            borderColor: '#FFFFFF44',
          },
        ]}
      >
        <Text style={[styles.primaryBtnText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>{text}</Text>
        <Ionicons name="sparkles" size={20} color={theme.accentOnColor ?? '#FFFFFF'} />
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useTranslation();
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
    hapticSuccess();
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
    hapticMedium();
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
        <Text style={[styles.title, styles.cuisineSectionTitle, { color: theme.text }]}>{t('onboarding.cuisineTitle')}</Text>
        <Text style={[styles.sub, { color: theme.subtext }]}>
          {t('onboarding.cuisineSubtitle')}
        </Text>
        <ImportanceLevelPicker
          metric={CUISINE_FIT_METRIC}
          value={weights.cuisine}
          onChange={level => setWeight('cuisine', level)}
        />
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

  const pct = page === 0 ? 25 : page === 1 ? 50 : 100;

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <BackButton onPress={goBack} disabled={!canGoBack} size={26} />
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
            </View>
            <Text style={[styles.progressText, { color: theme.accent }]}>{pct}%</Text>
          </View>
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
          <AnimatedContinueButton
            onPress={goNext}
            text={page === STEPS - 1 ? t('onboarding.startExploring') : t('onboarding.continue')}
            theme={theme}
          />
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'right',
  },
  page: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  cuisineSectionTitle: { marginTop: 4 },
  sub: { fontSize: 14, marginBottom: 16, lineHeight: 20, textAlign: 'center' },
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
