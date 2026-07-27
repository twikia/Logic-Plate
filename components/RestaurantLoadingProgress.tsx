import type { RestaurantLoadProgress, RestaurantLoadStage } from '@/core/restaurantOrchestrator';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import i18n from '@/i18n';

export type RestaurantLoadProgressFlavor = 'health' | 'random' | 'cuisine';

type DetailTarget = NonNullable<RestaurantLoadProgress['detail']>;

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

function formatDetail(detail: DetailTarget | null): string | null {
  if (!detail || detail.total <= 0) return null;
  const t = i18n.t.bind(i18n);
  if (detail.unit === 'overviews') {
    return t('loading.overviewsProgress', { done: detail.done, total: detail.total });
  }
  if (detail.unit === 'cells') {
    return t('loading.cellsProgress', { done: detail.done, total: detail.total });
  }
  if (detail.unit === 'restaurants') {
    return t('loading.restaurantsProgress', { done: detail.done, total: detail.total });
  }
  return t('loading.progressDetail', { done: detail.done, total: detail.total });
}

function easeToward(current: number, target: number, factor: number, minStep: number): number {
  if (current >= target) return target;
  const gap = target - current;
  return Math.min(target, current + Math.max(minStep, gap * factor));
}

function easeCount(current: number, target: number): number {
  if (current >= target) return target;
  const gap = target - current;
  if (gap <= 3) return current + 1;
  return Math.min(target, current + Math.max(1, Math.ceil(gap * 0.22)));
}

const STAGE_SOFT_CAP: Record<Exclude<RestaurantLoadStage, 'done'>, number> = {
  'reading-cache': 0.14,
  'fetching-restaurants': 0.44,
  'parsing-restaurants': 0.54,
  'loading-overviews': 0.96,
};

export function useRestaurantLoadProgress(
  isLoading: boolean,
  flavor: RestaurantLoadProgressFlavor
) {
  const [loadingStage, setLoadingStage] = useState(i18n.t('loading.preparing'));
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const hardCeilingRef = useRef(0);
  const softCeilingRef = useRef(0);
  const stageRef = useRef<RestaurantLoadStage | 'preparing' | 'gps'>('preparing');
  const detailStageRef = useRef<RestaurantLoadStage | 'preparing' | 'gps' | null>(null);
  const targetDetailRef = useRef<DetailTarget | null>(null);
  const displayDetailRef = useRef<DetailTarget | null>(null);
  const displayProgressRef = useRef(0);
  const completeRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingDetail(null);
      completeRef.current = false;
      return;
    }

    completeRef.current = false;
    const tickMs = 50;
    const interval = setInterval(() => {
      // Progress: ease toward soft ceiling, and keep creeping while a stage is active.
      if (!completeRef.current) {
        const hard = hardCeilingRef.current;
        let soft = softCeilingRef.current;
        if (soft < hard) soft = hard;

        const stage = stageRef.current;
        const stageCap =
          stage === 'done' || stage === 'preparing' || stage === 'gps'
            ? hard
            : STAGE_SOFT_CAP[stage];

        if (displayProgressRef.current >= soft - 0.0005 && soft < stageCap) {
          soft = Math.min(stageCap, soft + 0.004);
        }
        softCeilingRef.current = soft;

        const next = easeToward(displayProgressRef.current, soft, 0.16, 0.003);
        if (next !== displayProgressRef.current) {
          displayProgressRef.current = next;
          setLoadingProgress(next);
        }
      } else if (displayProgressRef.current < 1) {
        const next = easeToward(displayProgressRef.current, 1, 0.28, 0.02);
        displayProgressRef.current = next;
        setLoadingProgress(next);
      }

      // Detail counts: always count up even if the target arrived in one jump.
      const target = targetDetailRef.current;
      if (!target) return;

      const prev = displayDetailRef.current;
      if (!prev || prev.unit !== target.unit) {
        const seeded: DetailTarget = {
          unit: target.unit,
          done: 0,
          total: Math.max(1, Math.min(target.total, Math.ceil(target.total * 0.12))),
        };
        displayDetailRef.current = seeded;
        setLoadingDetail(formatDetail(seeded));
        return;
      }

      const nextDone = easeCount(prev.done, target.done);
      const nextTotal = easeCount(prev.total, target.total);
      if (nextDone !== prev.done || nextTotal !== prev.total) {
        const next: DetailTarget = { unit: target.unit, done: nextDone, total: nextTotal };
        displayDetailRef.current = next;
        setLoadingDetail(formatDetail(next));
      }
    }, tickMs);

    return () => clearInterval(interval);
  }, [isLoading]);

  const applyStage = useCallback((stageLabel: string, stageKey: RestaurantLoadStage | 'preparing' | 'gps') => {
    stageRef.current = stageKey;
    setLoadingStage(stageLabel);
  }, []);

  const startGpsPhase = useCallback(() => {
    completeRef.current = false;
    targetDetailRef.current = null;
    displayDetailRef.current = null;
    detailStageRef.current = null;
    setLoadingDetail(null);
    applyStage(i18n.t('loading.acquiringGps'), 'gps');
    hardCeilingRef.current = 0.05;
    softCeilingRef.current = 0.05;
    displayProgressRef.current = 0.02;
    setLoadingProgress(0.02);
  }, [applyStage]);

  const startFetchPhase = useCallback(() => {
    completeRef.current = false;
    applyStage(i18n.t('loading.loadingRestaurants'), 'fetching-restaurants');
    hardCeilingRef.current = Math.max(hardCeilingRef.current, 0.1);
    softCeilingRef.current = Math.max(softCeilingRef.current, 0.1);
    displayProgressRef.current = Math.max(displayProgressRef.current, 0.06);
    setLoadingProgress(displayProgressRef.current);
  }, [applyStage]);

  const onOrchestratorProgress = useCallback(
    ({ stage, progress, detail }: RestaurantLoadProgress) => {
      const labels = getLabels(flavor);
      if (stage === 'done') {
        applyStage(i18n.t('loading.done'), 'done');
        completeRef.current = true;
        hardCeilingRef.current = 1;
        softCeilingRef.current = 1;
        if (targetDetailRef.current && displayDetailRef.current) {
          displayDetailRef.current = { ...targetDetailRef.current };
          setLoadingDetail(formatDetail(displayDetailRef.current));
        }
        return;
      }

      const stageChanged = stageRef.current !== stage;
      applyStage(labels[stage], stage);
      completeRef.current = false;
      hardCeilingRef.current = Math.max(hardCeilingRef.current, progress);
      softCeilingRef.current = Math.max(softCeilingRef.current, progress);

      if (detail && detail.total > 0) {
        targetDetailRef.current = {
          unit: detail.unit,
          done: Math.max(0, detail.done),
          total: Math.max(1, detail.total),
        };
        const shouldReseed =
          stageChanged ||
          detailStageRef.current !== stage ||
          !displayDetailRef.current ||
          displayDetailRef.current.unit !== detail.unit;
        if (shouldReseed) {
          detailStageRef.current = stage;
          displayDetailRef.current = {
            unit: detail.unit,
            done: 0,
            total: Math.max(1, Math.min(detail.total, Math.ceil(detail.total * 0.12))),
          };
          setLoadingDetail(formatDetail(displayDetailRef.current));
        }
      }
    },
    [applyStage, flavor]
  );

  const snapProgressComplete = useCallback(() => {
    completeRef.current = true;
    hardCeilingRef.current = 1;
    softCeilingRef.current = 1;
    applyStage(i18n.t('loading.done'), 'done');
    if (targetDetailRef.current) {
      displayDetailRef.current = { ...targetDetailRef.current };
      setLoadingDetail(formatDetail(displayDetailRef.current));
    }
  }, [applyStage]);

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
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
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
