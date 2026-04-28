import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Image, ScrollView,
  StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getNearbyRestaurants } from '../core/restaurantOrchestrator';
import { getSearchRadius } from '../core/userSettings';

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
      <View style={{ height: 130, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      <View style={styles.cardContent}>
        <View style={{ height: 18, width: '70%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 6, marginBottom: 8 }} />
        <View style={{ height: 14, width: '40%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 12 }} />
        <View style={{ height: 28, width: '55%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14 }} />
      </View>
    </Animated.View>
  );
}

function PhotoStrip({ photos }: { photos: any[] }) {
  if (!photos?.length) {
    return (
      <View style={styles.photoPlaceholder}>
        <Ionicons name="restaurant-outline" size={36} color="rgba(255,255,255,0.15)" />
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {photos.slice(0, 3).map((photo: any, i: number) => (
        <Image
          key={i}
          source={{ uri: photo.url }}
          style={styles.photo}
          resizeMode="cover"
        />
      ))}
    </ScrollView>
  );
}

function RestaurantCard({ item }: { item: any }) {
  const name = item.displayName?.text || 'Unknown';
  const price = PRICE_MAP[item.priceLevel] || '';
  const rating = item.rating?.toFixed(1);
  const distM = Math.round(item.distanceMeters);
  const distance = distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}km`;

  return (
    <View style={styles.card}>
      <PhotoStrip photos={item.photos || []} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.restaurantName} numberOfLines={2}>{name}</Text>
          {price ? (
            <View style={styles.pricePill}>
              <Text style={styles.priceText}>{price}</Text>
            </View>
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
            <Ionicons name="location-outline" size={12} color="#F9A06F" />
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
      </View>
    </View>
  );
}

export default function ResultsScreen() {
  const { cuisine, cuisineKey } = useLocalSearchParams<{ cuisine: string; cuisineKey: string }>();
  const router = useRouter();

  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayed, setDisplayed] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => { fetchResults(); }, []);

  const fetchResults = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location access is needed to find restaurants near you.\n\nEnable it in your device Settings → Privacy → Location.');
        setIsLoading(false);
        return;
      }

      const [loc, radiusMeters] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        getSearchRadius(),
      ]);

      const all = await getNearbyRestaurants(loc.coords.latitude, loc.coords.longitude, radiusMeters);

      // Filter: open now
      const openNow = all.filter(r => r.currentOpeningHours?.openNow === true || r.businessStatus === 'OPERATIONAL');

      // Filter: cuisine type
      const types = CUISINE_TYPE_MAP[cuisineKey] ?? [];
      const filtered = types.length === 0
        ? openNow
        : openNow.filter(r => types.some(t => r.primaryType === t || r.types?.includes(t)));

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

  const loadMore = () => {
    const next = allResults.slice(0, displayed.length + PAGE_SIZE);
    setDisplayed(next);
    setHasMore(next.length < allResults.length);
  };

  const ListFooter = () => {
    if (!hasMore) return <View style={{ height: 40 }} />;
    return (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
        <Text style={styles.loadMoreText}>Load More</Text>
        <Ionicons name="chevron-down" size={16} color="#F97352" />
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{cuisine}</Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={styles.subtitle}>Finding restaurants near you…</Text>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Ionicons name="location-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchResults}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : allResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>No open {cuisine} restaurants found nearby.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryText}>Try Another Cuisine</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RestaurantCard item={item} />}
            ListHeaderComponent={
              <Text style={styles.subtitle}>{allResults.length} open spots found nearby</Text>
            }
            ListFooterComponent={<ListFooter />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  card: {
    backgroundColor: 'rgba(30,15,30,0.65)', borderRadius: 20,
    marginBottom: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  photoPlaceholder: {
    height: 130, backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  photo: { width: 200, height: 130 },
  cardContent: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
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
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 8,
  },
  healthLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  healthBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  healthFill: { height: '100%', backgroundColor: '#4CD964', borderRadius: 2 },
  healthPending: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' },
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
    backgroundColor: 'rgba(249,115,82,0.15)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(249,115,82,0.4)',
  },
  loadMoreText: { fontSize: 15, fontWeight: '700', color: '#F97352' },
});
