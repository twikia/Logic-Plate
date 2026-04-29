import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isOpenNow } from '../../../core/isOpenNow';
import { getLocation } from '../../../core/locationCache';
import { getNearbyRestaurants } from '../../../core/restaurantOrchestrator';
import { getSearchRadius, setSearchRadius } from '../../../core/userSettings';
import { setCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage } from '../../../core/images';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

const CUISINE_TYPE_MAP: Record<string, string[]> = {
  italian: ['italian_restaurant'],
  mexican: ['mexican_restaurant'],
  japanese: ['japanese_restaurant'],
  chinese: ['chinese_restaurant'],
  american: ['american_restaurant', 'hamburger_restaurant'],
  indian: ['indian_restaurant'],
  thai: ['thai_restaurant'],
  mediterranean: ['mediterranean_restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  bars: ['bar'],
  smoothies: ['ice_cream_shop', 'juice_shop'],
  seafood: ['seafood_restaurant'],
  steakhouse: ['steak_house'],
  vegan: ['vegan_restaurant', 'vegetarian_restaurant'],
  pizza: ['pizza_restaurant'],
  dessert: ['bakery', 'dessert_shop', 'dessert_restaurant'],
};

const RADIUS_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000];

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
  const { formatDistance } = useDistanceFormatter();

  const name = item.displayName?.text || 'Unknown';
  const rating = item.rating?.toFixed(1);
  const distM = Math.round(item.distanceMeters ?? 0);
  const dist = formatDistance(distM);
  const price = PRICE_MAP[item.priceLevel] || '';
  const isOpen = isOpenNow(item);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onToggle}
      style={[styles.row, selected && styles.rowSelected]}
    >
      {/* Thumb — RestaurantImage handles spinner, fallback, and caching */}
      <View style={styles.thumbWrap}>
        <RestaurantImage
          restaurantId={item.id}
          photos={item.photos || []}
          width={56}
          height={56}
          quality={200}
          loadDelay={400}
          borderRadius={12}
        />
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
  const navigation = useNavigation();

  const [allResults, setAllResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [radius, setRadius] = useState(4000);
  const [showRadius, setShowRadius] = useState(false);
  const { formatLabel } = useDistanceFormatter();

  // ── Filter state ──
  const [showFilters, setShowFilters] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedPrices, setSelectedPrices] = useState<Set<string>>(new Set());
  const [minRating, setMinRating] = useState(0);
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'distance' | 'price' | 'health' | 'rating'>('distance');

  const PRICE_LEVELS = [
    { key: 'PRICE_LEVEL_INEXPENSIVE', label: '$' },
    { key: 'PRICE_LEVEL_MODERATE', label: '$$' },
    { key: 'PRICE_LEVEL_EXPENSIVE', label: '$$$' },
    { key: 'PRICE_LEVEL_VERY_EXPENSIVE', label: '$$$$' },
  ];
  const RATING_OPTS = [0, 3.0, 3.5, 4.0, 4.5];

  const togglePrice = (key: string) => {
    const next = new Set(selectedPrices);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedPrices(next);
  };

  const toggleCuisine = (key: string) => {
    const next = new Set(selectedCuisines);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedCuisines(next);
  };

  const activeFilterCount =
    (openOnly ? 1 : 0) +
    (selectedPrices.size > 0 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (selectedCuisines.size > 0 ? 1 : 0);

  useEffect(() => {
    getSearchRadius().then(r => {
      setRadius(r);
      loadResults(r);
    });
  }, []);

  const loadResults = async (r?: number, isRefresh = false) => {
    const searchRadius = r ?? radius;
    if (!isRefresh) setIsLoading(true);
    setErrorMsg(null);
    try {
      // Use cached GPS — avoids 3-10s re-acquisition on every navigation
      const coords = await getLocation(isRefresh);
      if (!coords) {
        setErrorMsg('Location access is needed to find nearby restaurants.\n\nEnable it in Settings → Privacy → Location.');
        setIsLoading(false);
        return;
      }
      const all = await getNearbyRestaurants(coords.latitude, coords.longitude, searchRadius);
      setAllResults(all);

      // Select only restaurants that are open right now (real time check)
      const initialSelected = all.filter((r: any) => isOpenNow(r));
      setSelected(new Set(initialSelected.map((r: any) => r.id)));
    } catch (e) {
      console.error(e);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResults(radius, true);
    setRefreshing(false);
  };

  const changeRadius = async (val: number) => {
    setRadius(val);
    await setSearchRadius(val);
    setShowRadius(false);
    loadResults(val);
  };

  const filtered = allResults.filter(r => {
    if (!((r.displayName?.text || '').toLowerCase().includes(filter.toLowerCase()))) return false;
    if (openOnly) {
      if (!isOpenNow(r)) return false;
    }
    if (selectedPrices.size > 0 && r.priceLevel && !selectedPrices.has(r.priceLevel)) return false;
    if (minRating > 0 && (!r.rating || r.rating < minRating)) return false;
    if (selectedCuisines.size > 0) {
      const pType = r.primaryType;
      const tTypes = r.types || [];
      const hasMatch = Array.from(selectedCuisines).some(cuisineKey => {
        const mappedTypes = CUISINE_TYPE_MAP[cuisineKey] || [];
        return mappedTypes.some(t => pType === t || tTypes.includes(t));
      });
      if (!hasMatch) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'distance') {
      return (a.distanceMeters || 0) - (b.distanceMeters || 0);
    } else if (sortBy === 'rating') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (sortBy === 'price') {
      const priceLevels = ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'];
      const priceA = a.priceLevel ? priceLevels.indexOf(a.priceLevel) : -1;
      const priceB = b.priceLevel ? priceLevels.indexOf(b.priceLevel) : -1;
      const aVal = priceA === -1 ? 999 : priceA;
      const bVal = priceB === -1 ? 999 : priceB;
      return aVal - bVal;
    } else if (sortBy === 'health') {
      return (b.healthScore || 0) - (a.healthScore || 0);
    }
    return 0;
  });

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
    const pool = filtered.filter(r => selected.has(r.id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCurrentRestaurant(pick);
    router.push('/random-result');
  };

  const selectedCount = filtered.filter(r => selected.has(r.id)).length;

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </AnimatedPressable>
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
          <TouchableOpacity 
            style={styles.radiusChip} 
            onPress={() => {
              setShowRadius(!showRadius);
              if (!showRadius) setShowFilters(false);
            }}
          >
            <Ionicons name="location" size={12} color="#F9A06F" />
            <Text style={styles.radiusChipText}>{formatLabel(radius)}</Text>
            <Ionicons name={showRadius ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.radiusChip, activeFilterCount > 0 && styles.filterChipActive]}
            onPress={() => {
              setShowFilters(!showFilters);
              if (!showFilters) setShowRadius(false);
            }}
          >
            <Ionicons name="options-outline" size={12} color={activeFilterCount > 0 ? '#FFFFFF' : '#F9A06F'} />
            <Text style={[styles.radiusChipText, activeFilterCount > 0 && { color: '#FFFFFF' }]}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
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
                  {formatLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showFilters && (
          <View style={styles.filterPanel}>
            {/* Open Now toggle */}
            <View style={[styles.filterRow, { justifyContent: 'flex-start', gap: 12 }]}>
              <Text style={styles.filterLabel}>Open Now</Text>
              <TouchableOpacity
                style={[styles.filterToggle, openOnly && styles.filterToggleOn]}
                onPress={() => setOpenOnly(v => !v)}
              >
                {openOnly && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                <Text style={[styles.filterToggleText, openOnly && { color: '#FFFFFF' }]}>
                  {openOnly ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Price filter */}
            <Text style={styles.filterSubLabel}>Price</Text>
            <View style={styles.filterPills}>
              <TouchableOpacity
                style={[styles.filterPill, selectedPrices.size === 0 && styles.filterPillActive]}
                onPress={() => setSelectedPrices(new Set())}
              >
                <Text style={[styles.filterPillText, selectedPrices.size === 0 && styles.filterPillTextActive]}>Any</Text>
              </TouchableOpacity>
              {PRICE_LEVELS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.filterPill, selectedPrices.has(p.key) && styles.filterPillActive]}
                  onPress={() => togglePrice(p.key)}
                >
                  <Text style={[styles.filterPillText, selectedPrices.has(p.key) && styles.filterPillTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Min Rating filter */}
            <Text style={styles.filterSubLabel}>Min Rating</Text>
            <View style={styles.filterPills}>
              {RATING_OPTS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterPill, minRating === r && styles.filterPillActive]}
                  onPress={() => setMinRating(r)}
                >
                  <Text style={[styles.filterPillText, minRating === r && styles.filterPillTextActive]}>
                    {r === 0 ? 'Any' : `${r}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cuisines filter */}
            <Text style={styles.filterSubLabel}>Cuisines</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {Object.keys(CUISINE_TYPE_MAP).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterPill, selectedCuisines.has(key) && styles.filterPillActive]}
                  onPress={() => toggleCuisine(key)}
                >
                  <Text style={[styles.filterPillText, selectedCuisines.has(key) && styles.filterPillTextActive]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Sort filter */}
            <Text style={styles.filterSubLabel}>Sort By</Text>
            <View style={styles.filterPills}>
              <TouchableOpacity
                style={[styles.filterPill, sortBy === 'distance' && styles.filterPillActive]}
                onPress={() => setSortBy('distance')}
              >
                <Text style={[styles.filterPillText, sortBy === 'distance' && styles.filterPillTextActive]}>Distance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, sortBy === 'price' && styles.filterPillActive]}
                onPress={() => setSortBy('price')}
              >
                <Text style={[styles.filterPillText, sortBy === 'price' && styles.filterPillTextActive]}>Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, sortBy === 'health' && styles.filterPillActive]}
                onPress={() => setSortBy('health')}
              >
                <Text style={[styles.filterPillText, sortBy === 'health' && styles.filterPillTextActive]}>Health Score</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, sortBy === 'rating' && styles.filterPillActive]}
                onPress={() => setSortBy('rating')}
              >
                <Text style={[styles.filterPillText, sortBy === 'rating' && styles.filterPillTextActive]}>Rating</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Select all row */}
        {!isLoading && !errorMsg && allResults.length > 0 && (
          <View style={styles.selectAllRow}>
            <Text style={styles.subtitle}>{filtered.length} restaurants matching filters</Text>
            <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
              <View style={[styles.checkbox, allSelectedInView && styles.checkboxSelected]}>
                {allSelectedInView && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.selectAllText}>
                {allSelectedInView ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
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
            <Text style={styles.errorText}>No restaurants found within {formatLabel(radius)}.</Text>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
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
  bg: { flex: 1 },
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
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },

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
  thumb: { width: 56, height: 56 },
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

  // Filter chip (active state)
  filterChipActive: { backgroundColor: '#F97352', borderColor: '#F97352' },

  // Filter panel
  filterPanel: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(30,15,30,0.75)', borderRadius: 18,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  filterSubLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginTop: 4 },
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterToggleOn: { backgroundColor: '#4CD964', borderColor: '#4CD964' },
  filterToggleText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  filterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  filterPillActive: { backgroundColor: '#F97352', borderColor: '#F97352' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  filterPillTextActive: { color: '#FFFFFF' },
});
