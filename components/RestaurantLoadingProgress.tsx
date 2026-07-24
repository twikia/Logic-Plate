import type { RestaurantLoadProgress, RestaurantLoadStage } from '@/core/restaurantOrchestrator';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import i18n from '@/i18n';

export type RestaurantLoadProgressFlavor = 'health' | 'random' | 'cuisine';

function getLabels(flavor: RestaurantLoadProgressFlavor): Record<Exclude<RestaurantLoadStage, 'done'>, string> {
  const t = i18n.t.bind(i18n);
  if (flavor === 'health') {
    return {
      'reading-cache': t('loading.checkingCache'),
      'fetching-restaurants': t('loading.loadingRestaurants'),
      'parsing-restaurants': t('loading.rankingRestaurants'),
      'loading-overviews': t('loading.finalizingHealth'),
    };
  }
  return {
    'reading-cache': t('loading.checkingCache'),
    'fetching-restaurants': t('loading.loadingRestaurants'),
    'parsing-restaurants': t('loading.organizing'),
    'loading-overviews': t('loading.finalizingResults'),
  };
}

function formatDetail(
  detail: RestaurantLoadProgress['detail']
): string | null {
  if (!detail || detail.total <= 0) return null;
  const t = i18n.t.bind(i18n);
  if (detail.unit === 'overviews') {
    return t('loading.overviewsProgress', { done: detail.done, total: detail.total });
  }
  if (detail.unit === 'cells') {
    return t('loading.cellsProgress', { done: detail.done, total: detail.total });
  }
  return t('loading.progressDetail', { done: detail.done, total: detail.total });
}

export function useRestaurantLoadProgress(
  isLoading: boolean,
  flavor: RestaurantLoadProgressFlavor
) {
  const [loadingStage, setLoadingStage] = useState(i18n.t('loading.preparing'));
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressCeilingRef = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingDetail(null);
      return;
    }

    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        const ceiling = progressCeilingRef.current;
        if (prev >= ceiling) return prev;

        const remaining = ceiling - prev;
        const step = Math.min(0.02, Math.max(0.004, remaining * 0.22));
        return Math.min(ceiling, prev + step);
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isLoading]);

  const startGpsPhase = useCallback(() => {
    setLoadingStage(i18n.t('loading.acquiringGps'));
    setLoadingDetail(null);
    progressCeilingRef.current = 0.05;
    setLoadingProgress(0.02);
  }, []);

  const startFetchPhase = useCallback(() => {
    setLoadingStage(i18n.t('loading.loadingRestaurants'));
    setLoadingDetail(null);
    progressCeilingRef.current = Math.max(progressCeilingRef.current, 0.1);
    setLoadingProgress((prev) => Math.max(prev, 0.06));
  }, []);

  const onOrchestratorProgress = useCallback(
    ({ stage, progress, detail }: RestaurantLoadProgress) => {
      const labels = getLabels(flavor);
      if (stage === 'done') {
        setLoadingStage(i18n.t('loading.done'));
        setLoadingDetail(null);
        progressCeilingRef.current = 1;
      } else {
        setLoadingStage(labels[stage]);
        setLoadingDetail(formatDetail(detail));
        progressCeilingRef.current = Math.max(progressCeilingRef.current, progress);
      }
      setLoadingProgress((prev) => Math.max(prev, Math.min(progress, progressCeilingRef.current)));
    },
    [flavor]
  );

  const snapProgressComplete = useCallback(() => {
    progressCeilingRef.current = 1;
    setLoadingProgress(1);
    setLoadingDetail(null);
  }, []);

  return {
    loadingStage,
    loadingDetail,
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
  detailLabel,
  style,
}: {
  stageLabel: string;
  progress: number;
  detailLabel?: string | null;
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
      {detailLabel ? <Text style={styles.detailText}>{detailLabel}</Text> : null}
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
    marginBottom: 4,
  },
  detailText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 10,
  },
});
