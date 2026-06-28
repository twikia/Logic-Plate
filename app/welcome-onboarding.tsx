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
import { Confetti } from '@/components/ui/Confetti';
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
            withTiming(0.96, { duration: 100 }),
            withTiming(1.0, { duration: 100 })
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

  const [isCompleting, setIsCompleting] = useState(false);
  const completingRef = useRef(false);

  const progressVal = useSharedValue(25);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);
  const contentOpacity = useSharedValue(1);
  const celebrationOpacity = useSharedValue(0);

  useEffect(() => {
    if (!isCompleting) {
      const targetPct = page === 0 ? 25 : page === 1 ? 50 : 75;
      progressVal.value = withTiming(targetPct, { duration: 250 });
    }
  }, [page, isCompleting, progressVal]);

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

  const finish = useCallback(async (cuisinesToSave?: string[]) => {
    hapticSuccess();
    await markOnboardingComplete({
      v: 1,
      weights,
      favoriteCuisines: cuisinesToSave && Array.isArray(cuisinesToSave) ? cuisinesToSave : favoriteCuisines,
      openNowOnly: true,
    });
    router.replace('/(tabs)' as any);
  }, [favoriteCuisines, router, weights]);

  const triggerCompletion = useCallback((cuisines?: string[]) => {
    if (completingRef.current) return;
    completingRef.current = true;
    setIsCompleting(true);
    hapticSuccess();

    progressVal.value = withTiming(100, { duration: 1500, easing: Easing.out(Easing.cubic) });
    translateY.value = withDelay(1500, withTiming(SCREEN_H * 0.38, { duration: 800, easing: Easing.out(Easing.cubic) }));
    translateX.value = withDelay(1500, withTiming(-17, { duration: 800, easing: Easing.out(Easing.cubic) }));
    scale.value = withDelay(1500, withTiming(0.85, { duration: 800, easing: Easing.out(Easing.cubic) }));
    contentOpacity.value = withDelay(1400, withTiming(0, { duration: 400 }));
    celebrationOpacity.value = withDelay(1800, withTiming(1, { duration: 600 }));

    setTimeout(() => {
      void finish(cuisines);
    }, 4500);
  }, [finish, progressVal, translateY, translateX, scale, contentOpacity, celebrationOpacity]);

  const setWeight = (key: keyof RecommendationWeights, level: ImportanceLevel) => {
    setWeights(w => ({ ...w, [key]: level }));
  };

  const goNext = () => {
    if (isCompleting) return;
    hapticMedium();
    if (page < STEPS - 1) {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      triggerCompletion(favoriteCuisines);
    }
  };

  const canGoBack = page > 0 || router.canGoBack();

  const goBack = () => {
    if (isCompleting) return;
    if (page > 0) {
      listRef.current?.scrollToIndex({ index: page - 1, animated: true });
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isCompleting) return;
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
          onChange={(next) => {
            setFavoriteCuisines(next);
            if (next.length === 5 && !completingRef.current) {
              triggerCompletion(next);
            }
          }}
          accent={theme.accent}
          textColor={theme.text}
        />
      </ScrollView>
    );
  };

  const progressContainerAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  const progressFillAnimStyle = useAnimatedStyle(() => ({
    width: `${progressVal.value}%`,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const celebrationAnimStyle = useAnimatedStyle(() => ({
    opacity: celebrationOpacity.value,
  }));

  if (!ready) {
    return <View style={[styles.root, { backgroundColor: theme.cardBackground }]} />;
  }

  const pct = page === 0 ? 25 : page === 1 ? 50 : 75;

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <Animated.View style={{ opacity: isCompleting ? 0 : 1 }}>
            <BackButton onPress={goBack} disabled={!canGoBack || isCompleting} size={26} />
          </Animated.View>
          <Animated.View style={[styles.progressContainer, progressContainerAnimStyle]}>
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Animated.View style={[styles.progressFill, { backgroundColor: theme.accent }, progressFillAnimStyle]} />
            </View>
            <Text style={[styles.progressText, { color: theme.accent }]}>
              {isCompleting ? '100%' : `${pct}%`}
            </Text>
          </Animated.View>
        </View>

        {isCompleting && (
          <Animated.View style={[styles.celebrationOverlay, celebrationAnimStyle]}>
            <Confetti />
            <Text style={[styles.celebrationTitle, { color: theme.text }]}>🎉 {t('onboarding.done', 'All Set!')}</Text>
            <Text style={[styles.celebrationSub, { color: theme.subtext }]}>Starting Platebound...</Text>
          </Animated.View>
        )}

        <Animated.View style={[{ flex: 1 }, contentAnimStyle]} pointerEvents={isCompleting ? 'none' : 'auto'}>
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
        </Animated.View>
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
  celebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    zIndex: 100,
    pointerEvents: 'none',
  },
  celebrationTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  celebrationSub: {
    fontSize: 15,
    fontWeight: '600',
  },
});
