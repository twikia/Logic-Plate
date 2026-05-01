import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage } from '../../../core/images';
import { getLocation } from '../../../core/locationCache';
import { getNearbyRestaurants } from '../../../core/restaurantOrchestrator';
import { getSearchRadius, setSearchRadius } from '../../../core/userSettings';

type SortMetric =
  | 'health'
  | 'recovery'
  | 'processed'
  | 'calorie'
  | 'protein'
  | 'carb';

const RADIUS_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000];
const SORT_OPTIONS: { key: SortMetric; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'processed', label: 'Processed' },
  { key: 'calorie', label: 'Calorie' },
  { key: 'protein', label: 'Protein' },
  { key: 'carb', label: 'Carb' },
];

function openMaps(name: string, lat: number, lng: number) {
  const encoded = encodeURIComponent(name);
  if (Platform.OS === 'ios') {
    Linking.openURL(`maps:0,0?q=${encoded}&ll=${lat},${lng}`).catch(() =>
      Linking.openURL(`https://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`)
    );
  } else {
    Linking.openURL(`geo:${lat},${lng}?q=${encoded}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
    );
  }
}

function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(1, safe / max));
  return (
    <View style={styles.scoreItem}>
      <View style={styles.scoreLabelRow}>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.scoreValue}>{safe.toFixed(max === 10 ? 1 : 0)}/{max}</Text>
      </View>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

function StarScore({ label, value }: { label: string; value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View style={styles.starWrap}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.starRow}>
        {Array.from({ length: 5 }, (_, i) => (
          <Ionicons
            key={`${label}_${i}`}
            name={i < rounded ? 'star' : 'star-outline'}
            size={12}
            color="#FFD66B"
          />
        ))}
      </View>
    </View>
  );
}

function HealthCard({
  place,
  onOpenDetails,
  onOpenLocalMap,
}: {
  place: any;
  onOpenDetails: () => void;
  onOpenLocalMap: () => void;
}) {
  const name = place.displayName?.text || 'Unknown';
  const ai = place.aiOverview;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();

  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.card} onPress={onOpenDetails}>
      <View style={styles.cardTop}>
        <View style={styles.thumbWrap}>
          <RestaurantImage
            restaurantId={place.id}
            photos={place.photos || []}
            width={66}
            height={66}
            quality={200}
            loadDelay={300}
            borderRadius={12}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{name}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {formatDistance(Math.round(place.distanceMeters ?? 0))} away
          </Text>
          <Text style={styles.scoreHeadline}>
            Health {typeof ai?.healthScore === 'number' ? ai.healthScore.toFixed(1) : '0.0'}/10
          </Text>
        </View>
      </View>

      <View style={styles.compactScores}>
        <ScoreBar label="Health" value={ai?.healthScore ?? 0} max={10} />
        <ScoreBar label="Recovery" value={ai?.workoutRecoveryScore ?? 0} max={10} />
        <ScoreBar label="Processed" value={ai?.processedScore ?? 0} max={10} />
        <StarScore label="Cal" value={ai?.calorieScore ?? 0} />
        <StarScore label="Protein" value={ai?.proteinScore ?? 0} />
        <StarScore label="Carb" value={ai?.carbScore ?? 0} />
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnHalf, !mapsReady && styles.actionBtnDisabled]}
          onPress={(e) => {
            e.stopPropagation();
            if (!mapsReady) return;
            openMaps(name, lat, lng);
          }}
        >
          <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={14} color="#FFFFFF" />
          <Text style={styles.actionBtnText} numberOfLines={1}>
            {Platform.OS === 'ios' ? 'Open in Apple Maps' : 'Open in Google Maps'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnHalf, styles.actionGhost]}
          onPress={(e) => {
            e.stopPropagation();
            onOpenLocalMap();
          }}
        >
          <Ionicons name="map-outline" size={14} color="#F9A06F" />
          <Text style={[styles.actionBtnText, styles.actionGhostText]} numberOfLines={1}>
            Find on Local Map
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function HealthScreen() {
  const router = useRouter();
  const [allResults, setAllResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [radius, setRadius] = useState(4000);
  const [showRadius, setShowRadius] = useState(false);
  const [metric, setMetric] = useState<SortMetric>('health');
  const [showMetric, setShowMetric] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { formatLabel } = useDistanceFormatter();

  useEffect(() => {
    getSearchRadius().then((savedRadius) => {
      setRadius(savedRadius);
      loadResults(savedRadius);
    });
  }, []);

  const scoreForMetric = (item: any, currentMetric: SortMetric) => {
    const ai = item.aiOverview;
    if (!ai) return -1;
    if (currentMetric === 'health') return ai.healthScore ?? -1;
    if (currentMetric === 'recovery') return ai.workoutRecoveryScore ?? -1;
    if (currentMetric === 'processed') return ai.processedScore ?? -1;
    if (currentMetric === 'calorie') return ai.calorieScore ?? -1;
    if (currentMetric === 'protein') return ai.proteinScore ?? -1;
    return ai.carbScore ?? -1;
  };

  const loadResults = async (requestedRadius?: number, isRefresh = false) => {
    const activeRadius = requestedRadius ?? radius;
    if (!isRefresh) setIsLoading(true);
    setErrorMsg(null);
    try {
      const coords = await getLocation(isRefresh);
      if (!coords) {
        setErrorMsg('Location access is required to rank nearby restaurants.');
        setIsLoading(false);
        return;
      }
      const all = await getNearbyRestaurants(coords.latitude, coords.longitude, activeRadius);
      setAllResults(all.filter((item) => !!item.aiOverview));
    } catch {
      setErrorMsg('Unable to load health rankings right now.');
    } finally {
      setIsLoading(false);
    }
  };

  const sorted = useMemo(() => {
    return [...allResults].sort((a, b) => scoreForMetric(b, metric) - scoreForMetric(a, metric));
  }, [allResults, metric]);

  const visibleCount = showAll ? sorted.length : 10;
  const visible = sorted.slice(0, visibleCount);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResults(radius, true);
    setRefreshing(false);
  };

  const changeRadius = async (nextRadius: number) => {
    setRadius(nextRadius);
    await setSearchRadius(nextRadius);
    setShowRadius(false);
    loadResults(nextRadius);
  };

  const openDetails = (item: any) => {
    setCurrentRestaurant(item);
    router.push('/random-result');
  };

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.background}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </AnimatedPressable>
          <Text style={styles.title}>Health Rankings</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.controlChip}
            onPress={() => {
              setShowRadius((prev) => !prev);
              setShowMetric(false);
            }}
          >
            <Ionicons name="location" size={12} color="#F9A06F" />
            <Text style={styles.controlChipText}>{formatLabel(radius)}</Text>
            <Ionicons name={showRadius ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlChip}
            onPress={() => {
              setShowMetric((prev) => !prev);
              setShowRadius(false);
            }}
          >
            <Ionicons name="funnel-outline" size={12} color="#F9A06F" />
            <Text style={styles.controlChipText}>
              {SORT_OPTIONS.find((opt) => opt.key === metric)?.label || 'Health'}
            </Text>
            <Ionicons name={showMetric ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {showRadius && (
          <View style={styles.panel}>
            {RADIUS_STEPS.map((step) => (
              <TouchableOpacity
                key={step}
                style={[styles.panelPill, radius === step && styles.panelPillActive]}
                onPress={() => changeRadius(step)}
              >
                <Text style={[styles.panelPillText, radius === step && styles.panelPillTextActive]}>
                  {formatLabel(step)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showMetric && (
          <View style={styles.panel}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.panelPill, metric === option.key && styles.panelPillActive]}
                onPress={() => setMetric(option.key)}
              >
                <Text style={[styles.panelPillText, metric === option.key && styles.panelPillTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            Showing {visible.length} of {sorted.length} ranked restaurants
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <Text style={styles.centerText}>Loading health rankings...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Text style={styles.centerText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadResults()}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HealthCard
                place={item}
                onOpenDetails={() => openDetails(item)}
                onOpenLocalMap={() => router.push('/map' as any)}
              />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
            contentContainerStyle={styles.list}
            ListFooterComponent={
              sorted.length > 10 && !showAll ? (
                <TouchableOpacity style={styles.expandBtnBottom} onPress={() => setShowAll(true)}>
                  <Text style={styles.expandBtnText}>Show All</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ height: 24 }} />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  controlChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  controlChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(30,15,30,0.72)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  panelPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  panelPillActive: { backgroundColor: '#F97352', borderColor: '#F97352' },
  panelPillText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  panelPillTextActive: { color: '#FFFFFF' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  metaText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  expandBtnText: { fontSize: 12, fontWeight: '700', color: '#F9A06F' },
  expandBtnBottom: {
    marginTop: 6,
    marginBottom: 24,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,82,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,82,0.5)',
    borderRadius: 14,
    paddingVertical: 12,
  },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: 'rgba(30,15,30,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  thumbWrap: { width: 66, height: 66, borderRadius: 12, overflow: 'hidden' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  cardSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  scoreHeadline: { fontSize: 12, color: '#BFF5B8', marginTop: 6, fontWeight: '700' },
  compactScores: { gap: 8 },
  scoreItem: { gap: 4 },
  scoreLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  scoreValue: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  scoreTrack: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.09)', overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 4, backgroundColor: '#68D8A3' },
  starWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starRow: { flexDirection: 'row', gap: 3 },
  cardActions: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F97352',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  actionBtnHalf: { flex: 1, minWidth: 0 },
  actionGhost: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionGhostText: { color: '#F9A06F' },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  actionBtnDisabled: { opacity: 0.45 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  centerText: { fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#F97352',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
});
