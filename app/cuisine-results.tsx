import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet,
  TouchableOpacity, Animated, ActivityIndicator,
  Linking, Platform, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getNearbyRestaurants } from '../core/restaurantOrchestrator';
import { getSearchRadius, setSearchRadius } from '../core/userSettings';
import { getCachedResults, setCachedResults } from '../core/resultCache';

const PAGE_SIZE = 10;

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
  other: [],
};

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

// ─── Photo with loading spinner ──────────────────────────────────────────────

function PhotoThumb({ uri }: { uri: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={styles.photoWrapper}>
      {!loaded && (
        <View style={styles.photoPlaceholder}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      )}
      <Image
        source={{ uri }}
        style={[styles.photo, !loaded && { opacity: 0 }]}
        contentFit="cover"
        transition={200}
        onLoad={() => setLoaded(true)}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

function PhotoStrip({ photos }: { photos: any[] }) {
  if (!photos?.length) {
    return (
      <View style={styles.photoPlaceholderFull}>
        <Ionicons name="restaurant-outline" size={36} color="rgba(255,255,255,0.12)" />
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {photos.slice(0, 3).map((photo: any, i: number) => (
        <PhotoThumb key={i} uri={photo.url} />
      ))}
    </ScrollView>
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

// ─── Restaurant Card ─────────────────────────────────────────────────────────

function RestaurantCard({ item }: { item: any }) {
  const name = item.displayName?.text || 'Unknown';
  const price = PRICE_MAP[item.priceLevel] || '';
  const rating = item.rating?.toFixed(1);
  const distM = Math.round(item.distanceMeters ?? 0);
  const distance = distM < 1000 ? `${distM}m away` : `${(distM / 1000).toFixed(1)}km away`;
  const lat = item.location?.latitude;
  const lng = item.location?.longitude;

  return (
    <View style={styles.card}>
      <PhotoStrip photos={item.photos || []} />
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
          <View style={[styles.metaPill, { borderColor: 'rgba(76,217,100,0.3)' }]}>
            <Ionicons name="time-outline" size={12} color="#4CD964" />
            <Text style={[styles.metaText, { color: '#4CD964' }]}>Open</Text>
          </View>
        </View>

        {/* Health score — placeholder */}
        <View style={styles.healthRow}>
          <Ionicons name="leaf-outline" size={13} color="#A8D5A2" />
          <Text style={styles.healthLabel}>Health Score</Text>
          <View style={styles.healthBar}>
            <View style={[styles.healthFill, { width: '0%' }]} />
          </View>
          <Text style={styles.healthPending}>Coming soon</Text>
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
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const { cuisine, cuisineKey } = useLocalSearchParams<{ cuisine: string; cuisineKey: string }>();
  const router = useRouter();

  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayed, setDisplayed] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [radius, setRadius] = useState(2000);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);

  useEffect(() => {
    getSearchRadius().then(setRadius);
    loadResults();
  }, []);

  const loadResults = async (forceRefetch = false) => {
    setIsLoading(true);
    setErrorMsg(null);

    // Try result cache first (skip if user manually changed radius)
    if (!forceRefetch) {
      const cached = await getCachedResults(cuisineKey);
      if (cached && cached.length > 0) {
        setAllResults(cached);
        setDisplayed(cached.slice(0, PAGE_SIZE));
        setHasMore(cached.length > PAGE_SIZE);
        setIsLoading(false);
        return;
      }
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location access is needed to find restaurants near you.\n\nEnable it in Settings → Privacy → Location.');
        setIsLoading(false);
        return;
      }

      const [loc, r] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        getSearchRadius(),
      ]);

      const all = await getNearbyRestaurants(loc.coords.latitude, loc.coords.longitude, r);
      const openNow = all.filter(p => p.currentOpeningHours?.openNow === true || p.businessStatus === 'OPERATIONAL');
      const types = CUISINE_TYPE_MAP[cuisineKey] ?? [];
      const filtered = types.length === 0
        ? openNow
        : openNow.filter(r => types.some(t => r.primaryType === t || r.types?.includes(t)));

      await setCachedResults(cuisineKey, filtered);
      setAllResults(filtered);
      setDisplayed(filtered.slice(0, PAGE_SIZE));
      setHasMore(filtered.length > PAGE_SIZE);
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
    setShowRadiusPicker(false);
    loadResults(true);
  };

  const loadMore = () => {
    const next = allResults.slice(0, displayed.length + PAGE_SIZE);
    setDisplayed(next);
    setHasMore(next.length < allResults.length);
  };

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{cuisine}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Radius bar */}
        <TouchableOpacity style={styles.radiusBar} onPress={() => setShowRadiusPicker(v => !v)}>
          <Ionicons name="location" size={14} color="#F9A06F" />
          <Text style={styles.radiusBarText}>Within {RADIUS_LABELS[radius]}</Text>
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
                  {RADIUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Text style={styles.subtitle}>Finding restaurants near you…</Text>
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
            <Text style={styles.errorText}>No open {cuisine} restaurants found within {RADIUS_LABELS[radius]}.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setShowRadiusPicker(true)}>
              <Text style={styles.retryText}>Expand Search Radius</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RestaurantCard item={item} />}
            ListHeaderComponent={
              <Text style={styles.subtitle}>{allResults.length} open spots within {RADIUS_LABELS[radius]}</Text>
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
    backgroundColor: 'rgba(30,15,30,0.65)', borderRadius: 20,
    marginBottom: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  photoWrapper: { width: 180, height: 120, position: 'relative' },
  photoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  photoPlaceholderFull: {
    height: 120, backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  photo: { width: 180, height: 120 },
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
