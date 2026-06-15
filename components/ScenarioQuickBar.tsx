import {
  SCENARIO_EMOJIS,
  SCENARIO_ORDER,
} from '@/core/scenarioFilters';
import { useAppTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { hapticLight } from '@/core/haptics';

const AUTO_SCROLL_MS = 52;
const AUTO_SCROLL_DELTA = 1.1;
const SCENARIO_TRIPLE = [...SCENARIO_ORDER, ...SCENARIO_ORDER, ...SCENARIO_ORDER];
const USER_PAUSE_MS = 2200;
const PRESS_IN_DELAY_MS = 140;

export function ScenarioQuickBar() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const singleCopyWRef = useRef(0);
  const layoutWRef = useRef(0);
  const didInitialJumpRef = useRef(false);
  const suppressScrollSyncRef = useRef(false);
  const userDraggingRef = useRef(false);
  const autoScrollPausedRef = useRef(false);
  const resumeAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseAutoScroll = useCallback(() => {
    autoScrollPausedRef.current = true;
    if (resumeAutoTimerRef.current) clearTimeout(resumeAutoTimerRef.current);
    resumeAutoTimerRef.current = setTimeout(() => {
      resumeAutoTimerRef.current = null;
      if (!userDraggingRef.current) {
        autoScrollPausedRef.current = false;
      }
    }, USER_PAUSE_MS);
  }, []);

  const jumpMargin = useCallback(() => {
    const w = singleCopyWRef.current;
    return w > 0 ? Math.min(48, w * 0.22) : 0;
  }, []);

  const applyScrollX = useCallback((x: number) => {
    suppressScrollSyncRef.current = true;
    scrollXRef.current = x;
    scrollRef.current?.scrollTo({ x, animated: false });
  }, []);

  const fixLoopBoundaries = useCallback(
    (x: number) => {
      const singleW = singleCopyWRef.current;
      const layoutW = layoutWRef.current;
      if (singleW < 80 || layoutW < 40) return x;
      const j = jumpMargin();
      const maxScroll = 3 * singleW - layoutW;
      if (x < j) {
        applyScrollX(x + singleW);
        return scrollXRef.current;
      }
      if (x > maxScroll - j) {
        applyScrollX(x - singleW);
        return scrollXRef.current;
      }
      return x;
    },
    [applyScrollX, jumpMargin]
  );

  const tryInitialScroll = useCallback(() => {
    if (didInitialJumpRef.current) return;
    const singleW = singleCopyWRef.current;
    if (singleW < 80 || layoutWRef.current < 40) return;
    didInitialJumpRef.current = true;
    applyScrollX(singleW);
  }, [applyScrollX]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (suppressScrollSyncRef.current) {
        suppressScrollSyncRef.current = false;
        scrollXRef.current = e.nativeEvent.contentOffset.x;
        return;
      }
      const raw = e.nativeEvent.contentOffset.x;
      if (userDraggingRef.current) {
        scrollXRef.current = raw;
        return;
      }
      let x = raw;
      x = fixLoopBoundaries(x);
      scrollXRef.current = x;
    },
    [fixLoopBoundaries]
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      if (w < 120) return;
      singleCopyWRef.current = w / 3;
      tryInitialScroll();
    },
    [tryInitialScroll]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      layoutWRef.current = e.nativeEvent.layout.width;
      tryInitialScroll();
    },
    [tryInitialScroll]
  );

  useEffect(() => {
    return () => {
      if (resumeAutoTimerRef.current) clearTimeout(resumeAutoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (autoScrollPausedRef.current || userDraggingRef.current) return;
      const singleW = singleCopyWRef.current;
      const layoutW = layoutWRef.current;
      if (singleW < 80 || layoutW < 40) return;
      const maxScroll = 3 * singleW - layoutW;
      if (maxScroll <= 8) return;
      let next = scrollXRef.current + AUTO_SCROLL_DELTA;
      const j = jumpMargin();
      if (next > maxScroll - j) next -= singleW;
      if (next < j) next += singleW;
      scrollXRef.current = next;
      scrollRef.current?.scrollTo({ x: next, animated: false });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(id);
  }, [jumpMargin]);

  const syncLoopAfterUserScroll = useCallback(() => {
    const singleW = singleCopyWRef.current;
    const layoutW = layoutWRef.current;
    if (singleW < 80 || layoutW < 40) return;
    let x = scrollXRef.current;
    x = fixLoopBoundaries(x);
    scrollXRef.current = x;
  }, [fixLoopBoundaries]);

  const chips = useMemo(() => {
    const neon = Boolean(theme.neonColors);
    const neonColors = theme.neonColors;
    const scenarioCount = SCENARIO_ORDER.length;
    return SCENARIO_TRIPLE.map((scenario, i) => {
      const circleInner = (
        <Text style={styles.emoji}>{SCENARIO_EMOJIS[scenario]}</Text>
      );
      const staggerDelay = (i % scenarioCount) * 40;
      return (
        <Animated.View
          key={`${i}-${scenario}`}
          entering={FadeInRight.delay(staggerDelay).duration(350)}
        >
          <TouchableOpacity
            activeOpacity={0.82}
            delayPressIn={PRESS_IN_DELAY_MS}
            style={styles.chipWrap}
            onPress={() => {
              hapticLight();
              router.push({ pathname: '/random', params: { scenario } });
            }}
          >
            {neon && neonColors ? (
              <LinearGradient
                colors={neonColors}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.circleNeonGrad}
              >
                <View
                  style={[
                    styles.circleNeonInner,
                    { backgroundColor: theme.cardBackground },
                  ]}
                >
                  {circleInner}
                </View>
              </LinearGradient>
            ) : (
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: theme.glassBackground,
                    borderColor: theme.cardBorderColor,
                  },
                ]}
              >
                {circleInner}
              </View>
            )}
            <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
              {t(`scenarios.${scenario}`, { defaultValue: scenario })}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      );
    });
  }, [router, t, theme.cardBackground, theme.cardBorderColor, theme.glassBackground, theme.neonColors, theme.text]);

  return (
    <View
      style={styles.wrap}
      onTouchStart={() => {
        pauseAutoScroll();
      }}
      onTouchEnd={() => {
        pauseAutoScroll();
      }}
      onTouchCancel={() => {
        pauseAutoScroll();
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          userDraggingRef.current = true;
          pauseAutoScroll();
        }}
        onScrollEndDrag={() => {
          userDraggingRef.current = false;
          pauseAutoScroll();
          syncLoopAfterUserScroll();
        }}
        onMomentumScrollEnd={() => {
          userDraggingRef.current = false;
          pauseAutoScroll();
          syncLoopAfterUserScroll();
        }}
        onContentSizeChange={w => onContentSizeChange(w)}
        onLayout={onLayout}
        contentContainerStyle={styles.row}
      >
        {chips}
      </ScrollView>
    </View>
  );
}

const CIRCLE_SIZE = 52;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
    paddingRight: 56,
  },
  chipWrap: {
    alignItems: 'center',
    width: 72,
    gap: 6,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleNeonGrad: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    padding: 1,
  },
  circleNeonInner: {
    flex: 1,
    borderRadius: CIRCLE_SIZE / 2 - 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
    width: '100%',
  },
});
