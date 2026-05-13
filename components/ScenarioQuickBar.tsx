import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import {
  SCENARIO_EMOJIS,
  SCENARIO_LABELS,
  SCENARIO_ORDER,
} from '@/core/scenarioFilters';
import { useAppTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
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

export function ScenarioQuickBar() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const contentWRef = useRef(0);
  const layoutWRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const onContentSizeChange = useCallback((w: number) => {
    contentWRef.current = w;
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    layoutWRef.current = e.nativeEvent.layout.width;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const max = Math.max(0, contentWRef.current - layoutWRef.current);
      if (max <= 4) return;
      let next = scrollXRef.current + AUTO_SCROLL_DELTA;
      if (next >= max - 2) next = 0;
      scrollXRef.current = next;
      scrollRef.current?.scrollTo({ x: next, animated: false });
    }, AUTO_SCROLL_MS);
    return () => {
      clearInterval(id);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      resumeTimerRef.current = null;
    }, 4000);
  }, []);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        onScrollBeginDrag={pauseAuto}
        onTouchStart={pauseAuto}
        contentContainerStyle={styles.row}
      >
        {SCENARIO_ORDER.map((scenario) => (
          <AnimatedPressable
            key={scenario}
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
        ))}
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
