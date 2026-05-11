import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Linking, Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { replaceCurrentRestaurantIfInList, setCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '../../../core/images';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';
import { getLocation } from '../../../core/locationCache';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '../../../core/restaurantOrchestrator';
import { AI_OVERVIEW_FIELD_PLACEHOLDER } from '../../../core/aiOverviewCache';
import { getCachedResults, setCachedResults } from '../../../core/resultCache';
import { getSearchRadius, setSearchRadius } from '../../../core/userSettings';
import { placeOffersSweets } from '../../../core/placeSweets';


const PAGE_SIZE = 10;

const CUISINE_TYPE_MAP: Record<string, string[]> = {
  italian: ['italian_restaurant'],
  mexican: ['mexican_restaurant'],
  asian: ['japanese_restaurant', 'chinese_restaurant', 'thai_restaurant', 'asian_restaurant'],
  american: ['american_restaurant', 'hamburger_restaurant'],
  indian: ['indian_restaurant'],
  mediterranean: ['mediterranean_restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  bars: ['bar'],
  smoothies: ['ice_cream_shop', 'juice_shop'],
  vegan: ['vegan_restaurant', 'vegetarian_restaurant'],
  pizza: ['pizza_restaurant'],
  dessert: [
    'bakery',
    'dessert_shop',
    'dessert_restaurant',
    'ice_cream_shop',
    'donut_shop',
    'candy_store',
    'chocolate_shop',
    'confectionery',
    'cake_shop',
    'pastry_shop',
    'acai_shop',
  ],
  other: [],
};

function filterCuisineResults(list: any[], key: string) {
  const types = CUISINE_TYPE_MAP[key] ?? [];
  return list.filter(p => {
    if (!isOpenNow(p)) return false;
    if (types.length === 0) return true;
    if (key === 'dessert') {
      return placeOffersSweets(p);
    }
    return types.some((t: string) => p.primaryType === t || p.types?.includes(t));
  });
}

const RADIUS_STEPS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000];

// ─── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
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
    <Animated.View style={[styles.card, { opacity: pulse }]}>
      <View style={{ height: 120, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      <View style={styles.cardContent}>
        <View style={{ height: 18, width: '65%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 6, marginBottom: 8 }} />
        <View style={{ height: 14, width: '40%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 12 }} />
        <View style={{ height: 28, width: '50%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14 }} />
      </View>
    </Animated.View>
  );
}



// ─── Maps helper ─────────────────────────────────────────────────────────────

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

// ─── Photo Strip (Horizontal scroll of images) ────────────────────────────────

function PhotoStrip({ restaurantId, photos }: { restaurantId: string; photos: any[] }) {
  // Show however many photos we actually have (1–3). Never render empty ghost slots.
  const displayPhotos = (photos || []).slice(0, 3);

  if (displayPhotos.length === 0) {
    return (
      <View style={[styles.photoEmpty, { height: 120 }]}>
        <Ionicons name="restaurant-outline" size={32} color="rgba(255,255,255,0.15)" />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.photoStrip}
      contentContainerStyle={styles.photoStripContent}
    >
      {displayPhotos.map((photo, index) => (
        <View key={`${restaurantId}_thumb_${index}`} style={styles.thumbContainer}>
          <RestaurantImage
            restaurantId={`${restaurantId}_p${index}`}
            photos={[photo]}
            width={180}
            height={120}
            quality={400}
            loadDelay={100 + (index * 150)}
            borderRadius={12}
          />
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Restaurant Card ─────────────────────────────────────────────────────────

function RestaurantCard({
  item,
  cuisineKey,
  openCheckEpoch,
  onOpenOverview,
}: {
  item: any;
  cuisineKey?: string;
  openCheckEpoch: number;
  onOpenOverview: () => void;
}) {
  const { formatDistance } = useDistanceFormatter();
  const name = item.displayName?.text || 'Unknown';
  const ai = item.aiOverview;
  const healthScore = typeof ai?.healthScore === 'number' ? ai.healthScore : null;
  const healthPct = healthScore != null ? Math.max(0, Math.min(100, (healthScore / 10) * 100)) : 0;
  void openCheckEpoch;
  const price = formatPlacePriceLabel(item);
  const openNow = isOpenNow(item);
  const rating = item.rating?.toFixed(1);
  const distM = Math.round(item.distanceMeters ?? 0);
  const distance = `${formatDistance(distM)} away`;
  const lat = item.location?.latitude;
  const lng = item.location?.longitude;
  // Start with Google Places photos as placeholder until three-tier fetch completes
  const [photos, setPhotos] = useState<any[]>(item.photos || []);

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      if (!item?.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return;

      const urls = await fetchRestaurantPhotoUrls({
        placeId:    item.id,
        name,
        latitude:   lat,
        longitude:  lng,
        websiteUrl: item.websiteUri || undefined,
        cuisineKey: cuisineKey || item.primaryType?.replace(/_restaurant$/, '') || undefined,
      });

      if (cancelled) return;

      // Use fetched URLs if we got any, otherwise keep the Google fallback
      setPhotos(urls.length > 0 ? urls.slice(0, 3) : (item.photos || []).slice(0, 3));
    };

    loadPhotos();
    return () => { cancelled = true; };
  }, [item?.id, name, lat, lng, item?.photos, cuisineKey]);

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.card} onPress={onOpenOverview}>
      <PhotoStrip restaurantId={item.id} photos={photos} />
      <View style={styles.cardContent}>

        <View style={styles.cardHeader}>
          <Text style={styles.restaurantName} numberOfLines={2}>{name}</Text>
          {price ? (
            <View style={styles.pricePill}><Text style={styles.priceText}>{price}</Text></View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          {rating && (
            <View style={styles.metaPill}>
              <Ionicons name="star" size={12} color="#FFD700" />
              <Text style={styles.metaText}>{rating}</Text>
            </View>
          )}
          <View style={styles.metaPill}>
            <Ionicons name="navigate-outline" size={12} color="#F9A06F" />
            <Text style={styles.metaText}>{distance}</Text>
          </View>
          <View style={[styles.metaPill, { borderColor: openNow ? 'rgba(76,217,100,0.3)' : 'rgba(255,100,100,0.3)' }]}>
            <Ionicons
              name={openNow ? 'checkmark-circle-outline' : 'close-circle-outline'}
              size={12}
              color={openNow ? '#4CD964' : '#FF6B6B'}
            />
            <Text style={[styles.metaText, { color: openNow ? '#4CD964' : '#FF6B6B' }]}>
              {openNow ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        <View style={styles.healthRow}>
          <Ionicons name="heart-outline" size={13} color="#A8D5A2" />
          <Text style={styles.healthLabel}>Health</Text>
          <View style={styles.healthBar}>
            <View style={[styles.healthFill, { width: `${healthPct}%` }]} />
          </View>
          <Text style={healthScore != null ? styles.healthValue : styles.healthPending}>
            {healthScore != null ? `${healthScore.toFixed(1)}/10` : AI_OVERVIEW_FIELD_PLACEHOLDER}
          </Text>
        </View>

        {/* Maps button */}
        {lat && lng && (
          <TouchableOpacity
            style={styles.mapsBtn}
            onPress={() => openMaps(name, lat, lng)}
          >
            <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={14} color="#FFFFFF" />
            <Text style={styles.mapsBtnText}>
              {Platform.OS === 'ios' ? 'Open in Maps' : 'Open in Google Maps'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const MemoizedRestaurantCard = React.memo(RestaurantCard);


export default function ResultsScreen() {
  const { cuisine, cuisineKey } = useLocalSearchParams<{ cuisine: string; cuisineKey: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();


  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayed, setDisplayed] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [radius, setRadius] = useState(4000);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openCheckEpoch, setOpenCheckEpoch] = useState(0);
  const { formatLabel } = useDistanceFormatter();
  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'cuisine');

  useEffect(() => {
    getSearchRadius().then(setRadius);
    loadResults();
  }, []);

  const loadResults = async (forceRefetch = false, isRefresh = false) => {
    if (!isRefresh) setIsLoading(true);
    setErrorMsg(null);
    startGpsPhase();

    if (!forceRefetch) {
      const cached = await getCachedResults(cuisineKey);
      if (cached && cached.length > 0) {
        setAllResults(cached);
        setDisplayed(cached.slice(0, PAGE_SIZE));
        setHasMore(cached.length > PAGE_SIZE);
        snapProgressComplete();
        setIsLoading(false);
        setOpenCheckEpoch((e) => e + 1);
        return;
      }
    }

    try {
      const [coords, r] = await Promise.all([
        getLocation(isRefresh),
        getSearchRadius(),
      ]);

      if (!coords) {
        setErrorMsg('Location access is needed to find restaurants near you.\n\nEnable it in Settings → Privacy → Location.');
        setIsLoading(false);
        return;
      }

      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        r,
        onOrchestratorProgress,
        {
          onAiReady: async (enriched) => {
            const filtered = filterCuisineResults(enriched, cuisineKey);
            await setCachedResults(cuisineKey, filtered);
            setAllResults(filtered);
            setDisplayed(filtered.slice(0, PAGE_SIZE));
            setHasMore(filtered.length > PAGE_SIZE);
            replaceCurrentRestaurantIfInList(filtered);
            setOpenCheckEpoch((e) => e + 1);
          },
        }
      );
      const filtered = filterCuisineResults(all, cuisineKey);

      await setCachedResults(cuisineKey, filtered);
      setAllResults(filtered);
      setDisplayed(filtered.slice(0, PAGE_SIZE));
      setHasMore(filtered.length > PAGE_SIZE);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      console.error(e);
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setErrorMsg(message);
    } finally {
      snapProgressComplete();
      setIsLoading(false);
      setOpenCheckEpoch((e) => e + 1);
    }
  };

  const changeRadius = async (val: number) => {
    setRadius(val);
    await setSearchRadius(val);
    setShowRadiusPicker(false);
    loadResults(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadResults(true, true);
    setRefreshing(false);
  };

  const loadMore = () => {
    const next = allResults.slice(0, displayed.length + PAGE_SIZE);
    setDisplayed(next);
    setHasMore(next.length < allResults.length);
  };

  const keyExtractor = React.useCallback((item: any) => item.id, []);
  const renderItem = React.useCallback(
    ({ item }: { item: any }) => (
      <MemoizedRestaurantCard
        item={item}
        cuisineKey={cuisineKey}
        openCheckEpoch={openCheckEpoch}
        onOpenOverview={() => {
          setCurrentRestaurant(item);
          router.push('/random-result');
        }}
      />
    ),
    [cuisineKey, router, openCheckEpoch]
  );

  return (
    <LinearGradient colors={theme.gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>

      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </AnimatedPressable>
          <Text style={[styles.title, { color: theme.text }]}>{cuisine}</Text>

          <View style={{ width: 40 }} />
        </View>

        {/* Radius bar */}
        <TouchableOpacity style={styles.radiusBar} onPress={() => setShowRadiusPicker(v => !v)}>
          <Ionicons name="location" size={14} color={theme.accent} />
          <Text style={styles.radiusBarText}>Within {formatLabel(radius)}</Text>

          <Ionicons name={showRadiusPicker ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>

        {showRadiusPicker && (
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

        {isLoading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <RestaurantLoadingProgressBar stageLabel={loadingStage} progress={loadingProgress} />
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Ionicons name="location-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadResults(true)}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : allResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>No open {cuisine} restaurants found within {formatLabel(radius)}.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setShowRadiusPicker(true)}>
              <Text style={styles.retryText}>Expand Search Radius</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayed}
            extraData={openCheckEpoch}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            removeClippedSubviews
            ListHeaderComponent={
              <Text style={styles.subtitle}>{allResults.length} open spots within {formatLabel(radius)}</Text>
            }
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                  <Text style={styles.loadMoreText}>Load More</Text>
                  <Ionicons name="chevron-down" size={16} color="#F97352" />
                </TouchableOpacity>
              ) : <View style={{ height: 40 }} />
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
          />
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
  radiusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  radiusBarText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
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
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 12 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  card: {
    backgroundColor: 'rgba(30,15,30,0.6)',
    borderRadius: 24,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoStrip: {
    height: 120,
  },
  photoStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  thumbContainer: {
    width: 180,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  photoEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  cardContent: { padding: 14 },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 8,
  },
  restaurantName: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', flex: 1, marginRight: 8 },
  pricePill: {
    backgroundColor: 'rgba(249,163,111,0.2)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(249,163,111,0.4)',
  },
  priceText: { fontSize: 12, fontWeight: '700', color: '#F9A06F' },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metaText: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  healthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    padding: 8, marginBottom: 10,
  },
  healthLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  healthBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  healthFill: { height: '100%', backgroundColor: '#4CD964', borderRadius: 2 },
  healthPending: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' },
  healthValue: { fontSize: 11, color: '#BFF5B8', fontWeight: '700' },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(249,115,82,0.85)', borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  mapsBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  errorText: { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: '#F97352', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 40, marginBottom: 40, paddingVertical: 14,
    backgroundColor: 'rgba(249,115,82,0.12)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(249,115,82,0.4)',
  },
  loadMoreText: { fontSize: 15, fontWeight: '700', color: '#F97352' },
});
