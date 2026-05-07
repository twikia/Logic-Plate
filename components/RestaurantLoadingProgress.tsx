import type { RestaurantLoadProgress, RestaurantLoadStage } from '@/core/restaurantOrchestrator';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type RestaurantLoadProgressFlavor = 'health' | 'random' | 'cuisine';

const DEFAULT_STAGE_LABELS: Record<Exclude<RestaurantLoadStage, 'done'>, string> = {
  'reading-cache': 'Checking restaurant cache...',
  'fetching-restaurants': 'Loading restaurants...',
  'parsing-restaurants': 'Organizing restaurants...',
  'loading-overviews': 'Finalizing results...',
};

const STAGE_LABELS: Record<
  RestaurantLoadProgressFlavor,
  Record<Exclude<RestaurantLoadStage, 'done'>, string>
> = {
  health: {
    'reading-cache': 'Checking restaurant cache...',
    'fetching-restaurants': 'Loading restaurants...',
    'parsing-restaurants': 'Ranking restaurants...',
    'loading-overviews': 'Finalizing health rankings...',
  },
  random: DEFAULT_STAGE_LABELS,
  cuisine: DEFAULT_STAGE_LABELS,
};

export function useRestaurantLoadProgress(
  isLoading: boolean,
  flavor: RestaurantLoadProgressFlavor
) {
  const [loadingStage, setLoadingStage] = useState('Preparing...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressCeilingRef = useRef(0);

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        const ceiling = progressCeilingRef.current;
        if (prev >= ceiling) return prev;

        const remaining = ceiling - prev;
        const step = Math.min(0.015, Math.max(0.003, remaining * 0.18));
        return Math.min(ceiling, prev + step);
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isLoading]);

  const startGpsPhase = useCallback(() => {
    setLoadingStage('Acquiring GPS...');
    progressCeilingRef.current = 0.22;
    setLoadingProgress(0.08);
  }, []);

  const startFetchPhase = useCallback(() => {
    setLoadingStage('Loading restaurants...');
    progressCeilingRef.current = 0.32;
    setLoadingProgress((prev) => Math.max(prev, 0.2));
  }, []);

  const onOrchestratorProgress = useCallback(
    ({ stage, progress }: RestaurantLoadProgress) => {
      const labels = STAGE_LABELS[flavor];
      if (stage === 'reading-cache') {
        setLoadingStage(labels['reading-cache']);
        progressCeilingRef.current = Math.max(progressCeilingRef.current, 0.38);
      } else if (stage === 'fetching-restaurants') {
        setLoadingStage(labels['fetching-restaurants']);
        progressCeilingRef.current = Math.max(progressCeilingRef.current, 0.72);
      } else if (stage === 'parsing-restaurants') {
        setLoadingStage(labels['parsing-restaurants']);
        progressCeilingRef.current = Math.max(progressCeilingRef.current, 0.84);
      } else if (stage === 'loading-overviews') {
        setLoadingStage(labels['loading-overviews']);
        progressCeilingRef.current = Math.max(progressCeilingRef.current, 0.97);
      } else if (stage === 'done') {
        setLoadingStage('Done');
        progressCeilingRef.current = 1;
      }
      setLoadingProgress((prev) => Math.max(prev, progress));
    },
    [flavor]
  );

  const snapProgressComplete = useCallback(() => {
    setLoadingProgress(1);
  }, []);

  return {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  };
}

export function RestaurantLoadingProgressBar({
  stageLabel,
  progress,
  style,
}: {
  stageLabel: string;
  progress: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.round(progress * 100);
  return (
    <View style={style}>
      <Text style={styles.stageLabel}>{stageLabel}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stageLabel: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10 },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F97352',
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
});
