import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef } from 'react';
import { ImageSourcePropType, ScrollView, StyleSheet, View } from 'react-native';

const SLIDE = 76;
const GAP = 10;
const STEP = 0.1;

type Props = {
  sources: readonly [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType, ImageSourcePropType];
  isActive: boolean;
};

export function CuisineImageStrip({ sources, isActive }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  const loopSources = useMemo(() => [...sources, ...sources], [sources]);
  const loopWidth = useMemo(
    () => sources.length * (SLIDE + GAP),
    [sources.length]
  );

  useEffect(() => {
    if (!isActive) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      return;
    }

    const tick = () => {
      offsetRef.current += STEP;
      if (offsetRef.current >= loopWidth) {
        offsetRef.current -= loopWidth;
      }
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [isActive, loopWidth]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        nestedScrollEnabled
        pointerEvents="none"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {loopSources.map((src, index) => (
          <Image key={index} source={src} style={styles.slide} contentFit="cover" transition={0} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  slide: {
    width: SLIDE,
    height: SLIDE,
    borderRadius: 14,
    marginRight: GAP,
  },
});
