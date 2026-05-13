import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import {
  SCENARIO_EMOJIS,
  SCENARIO_LABELS,
  SCENARIO_ORDER,
} from '@/core/scenarioFilters';
import { useAppTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const AUTO_SCROLL_MS = 48;
const AUTO_SCROLL_DELTA = 0.65;
const SCENARIO_TRIPLE = [...SCENARIO_ORDER, ...SCENARIO_ORDER, ...SCENARIO_ORDER];

export function ScenarioQuickBar() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const singleCopyWRef = useRef(0);
  const layoutWRef = useRef(0);
  const didInitialJumpRef = useRef(false);
  const suppressScrollSyncRef = useRef(false);

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
      let x = e.nativeEvent.contentOffset.x;
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
    const id = setInterval(() => {
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

  const chips = useMemo(
    () =>
      SCENARIO_TRIPLE.map((scenario, i) => (
        <AnimatedPressable
          key={`${i}-${scenario}`}
          style={[
            styles.chip,
            {
              backgroundColor: theme.glassBackground,
              borderColor: 'rgba(255,255,255,0.12)',
            },
          ]}
          onPress={() => {
            router.push({ pathname: '/random', params: { scenario } });
          }}
        >
          <Text style={styles.emoji}>{SCENARIO_EMOJIS[scenario]}</Text>
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
            {SCENARIO_LABELS[scenario]}
          </Text>
        </AnimatedPressable>
      )),
    [router, theme.glassBackground, theme.text]
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={w => onContentSizeChange(w)}
        onLayout={onLayout}
        contentContainerStyle={styles.row}
      >
        {chips}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
    paddingRight: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emoji: { fontSize: 18 },
  label: { fontSize: 14, fontWeight: '700', maxWidth: 140 },
});
