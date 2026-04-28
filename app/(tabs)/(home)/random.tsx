import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Animated, ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getNearbyRestaurants } from '../../../core/restaurantOrchestrator';
import { getSearchRadius, setSearchRadius } from '../../../core/userSettings';

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

const RADIUS_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];
const RADIUS_LABELS: Record<number, string> = {
  1000: '1km', 1500: '1.5km', 2000: '2km',
  2500: '2.5km', 3000: '3km', 4000: '4km', 5000: '5km',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.row, { opacity: pulse }]}>
      <View style={styles.skeletonThumb} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 15, width: '70%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 }} />
        <View style={{ height: 12, width: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }} />
      </View>
    </Animated.View>
  );
}

// ─── Selectable Restaurant Row ────────────────────────────────────────────────

function RestaurantRow({ item, selected, onToggle }: { item: any; selected: boolean; onToggle: () => void }) {
  const name = item.displayName?.text || 'Unknown';
  const rating = item.rating?.toFixed(1);
  const distM  = Math.round(item.distanceMeters ?? 0);
  const dist   = distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`;
  const price  = PRICE_MAP[item.priceLevel] || '';
  const photo  = item.photos?.[0]?.url;
  const isOpen = item.currentOpeningHours?.openNow ?? item.businessStatus === 'OPERATIONAL';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onToggle}
      style={[styles.row, selected && styles.rowSelected]}
    >
      {/* Thumb */}
      <View style={styles.thumbWrap}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="restaurant-outline" size={20} color="rgba(255,255,255,0.2)" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <View style={styles.rowMeta}>
          {rating && (
            <View style={styles.metaPill}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={styles.metaText}>{rating}</Text>
            </View>
          )}
          <View style={styles.metaPill}>
            <Ionicons name="navigate-outline" size={10} color="#F9A06F" />
            <Text style={styles.metaText}>{dist}</Text>
          </View>
          {price ? (
            <View style={styles.metaPill}>
              <Text style={[styles.metaText, { color: '#F9A06F' }]}>{price}</Text>
            </View>
          ) : null}
          <View style={[styles.metaPill, { borderColor: isOpen ? 'rgba(76,217,100,0.3)' : 'rgba(255,100,100,0.3)' }]}>
            <Ionicons
              name={isOpen ? 'checkmark-circle-outline' : 'close-circle-outline'}
              size={10}
              color={isOpen ? '#4CD964' : '#FF6B6B'}
            />
            <Text style={[styles.metaText, { color: isOpen ? '#4CD964' : '#FF6B6B' }]}>
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
      </View>

      {/* Checkbox */}
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RandomScreen() {
  const router = useRouter();

  const [allResults, setAllResults]   = useState<any[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [filter, setFilter]           = useState('');
  const [radius, setRadius]           = useState(2000);
  const [showRadius, setShowRadius]   = useState(false);

  useEffect(() => {
    getSearchRadius().then(setRadius);
    loadResults();
  }, []);

  const loadResults = async (forceRadius?: number) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location access is needed to find nearby restaurants.\n\nEnable it in Settings → Privacy → Location.');
        setIsLoading(false);
        return;
      }
      const [loc, r] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        getSearchRadius(),
      ]);
      const effectiveRadius = forceRadius ?? r;
      const all = await getNearbyRestaurants(loc.coords.latitude, loc.coords.longitude, effectiveRadius);
      setAllResults(all);
      // Start with everything selected
      setSelected(new Set(all.map((r: any) => r.id)));
    } catch (e) {
      console.error(e);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const changeRadius = async (val: number) => {
    setRadius(val);
    await setSearchRadius(val);
    setShowRadius(false);
    loadResults(val);
  };

  const filtered = allResults.filter(r =>
    (r.displayName?.text || '').toLowerCase().includes(filter.toLowerCase())
  );

  const allSelectedInView = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  const toggleSelectAll = () => {
    if (allSelectedInView) {
      const next = new Set(selected);
      filtered.forEach(r => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach(r => next.add(r.id));
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const pickOne = () => {
    const pool = allResults.filter(r => selected.has(r.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    router.push({ pathname: '/random-result', params: { data: JSON.stringify(pick) } });
  };

  const selectedCount = allResults.filter(r => selected.has(r.id)).length;

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Random Pick</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search + Radius bar */}
        <View style={styles.toolRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={14} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter restaurants…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={filter}
              onChangeText={setFilter}
            />
            {filter.length > 0 && (
              <TouchableOpacity onPress={() => setFilter('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.radiusChip} onPress={() => setShowRadius(v => !v)}>
            <Ionicons name="location" size={12} color="#F9A06F" />
            <Text style={styles.radiusChipText}>{RADIUS_LABELS[radius]}</Text>
            <Ionicons name={showRadius ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        {showRadius && (
          <View style={styles.radiusPicker}>
            {RADIUS_STEPS.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.radiusOption, radius === s && styles.radiusOptionActive]}
                onPress={() => changeRadius(s)}
              >
                <Text style={[styles.radiusOptionText, radius === s && styles.radiusOptionTextActive]}>
                  {RADIUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Select all row */}
        {!isLoading && !errorMsg && allResults.length > 0 && (
          <View style={styles.selectAllRow}>
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
              <View style={[styles.checkbox, allSelectedInView && styles.checkboxSelected]}>
                {allSelectedInView && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.selectAllText}>
                {allSelectedInView ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.countText}>
              {selectedCount} / {allResults.length} selected
            </Text>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Text style={styles.subtitle}>Finding restaurants near you…</Text>
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Ionicons name="location-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadResults()}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : allResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>No restaurants found within {RADIUS_LABELS[radius]}.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setShowRadius(true)}>
              <Text style={styles.retryText}>Expand Radius</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <RestaurantRow
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggleOne(item.id)}
              />
            )}
            ListHeaderComponent={
              <Text style={styles.subtitle}>
                {filtered.length} restaurant{filtered.length !== 1 ? 's' : ''} nearby
              </Text>
            }
            ListFooterComponent={<View style={{ height: 120 }} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Floating Pick One button */}
        {!isLoading && selectedCount > 0 && (
          <TouchableOpacity
            style={styles.pickBtn}
            activeOpacity={0.85}
            onPress={pickOne}
          >
            <LinearGradient
              colors={['#F97352', '#FF9A6F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pickBtnGradient}
            >
              <Ionicons name="shuffle" size={20} color="#FFFFFF" />
              <Text style={styles.pickBtnText}>Pick One  ({selectedCount})</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg:   { flex: 1 },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },

  toolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 6,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#FFFFFF', padding: 0 },

  radiusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  radiusChipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  radiusPicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(30,15,30,0.7)', borderRadius: 16, padding: 12,
  },
  radiusOption: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  radiusOptionActive: { backgroundColor: '#F97352', borderColor: '#F97352' },
  radiusOptionText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  radiusOptionTextActive: { color: '#FFFFFF' },

  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 6,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  countText: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },

  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10 },
  list:     { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(30,15,30,0.55)', borderRadius: 16,
    marginBottom: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowSelected: {
    borderColor: 'rgba(249,115,82,0.5)',
    backgroundColor: 'rgba(249,115,82,0.1)',
  },
  thumbWrap: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  thumb:     { width: 56, height: 56 },
  skeletonThumb: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  rowName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 5 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metaText: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },

  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#F97352', borderColor: '#F97352' },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  errorText: { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: '#F97352', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // Floating Pick button
  pickBtn: {
    position: 'absolute', bottom: 28, right: 20,
    borderRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  pickBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingVertical: 15, borderRadius: 30,
  },
  pickBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
