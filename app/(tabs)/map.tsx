import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, ScrollView, Animated } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { getLocation } from '@/core/locationCache';
import { getNearbyRestaurants } from '@/core/restaurantOrchestrator';
import { getCachedResults, setCachedResults } from '@/core/resultCache';
import { getSearchRadius, setSearchRadius } from '@/core/userSettings';
import { RestaurantImage } from '@/core/images';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { calculatePlateboundScore } from '@/core/ratingCalculator';

const { width, height } = Dimensions.get('window');
const MAP_RESULTS_KEY = 'map_results';
const MAX_MILES = 6;
const MAX_RADIUS_METERS = 8046.72; // 5 miles
const DEFAULT_RADIUS_METERS = 4000;
const DEG_PER_MILE = 1 / 69;
const MAX_DELTA = MAX_MILES * DEG_PER_MILE;

// --- Helper for opening maps ---
function openMaps(name: string, lat: number, lng: number) {
  const encoded = encodeURIComponent(name);
  if (Platform.OS === 'ios') {
    import('react-native').then(({ Linking }) => {
      Linking.openURL(`maps:0,0?q=${encoded}&ll=${lat},${lng}`).catch(() =>
        Linking.openURL(`https://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`)
      );
    });
  } else {
    import('react-native').then(({ Linking }) => {
      Linking.openURL(`geo:${lat},${lng}?q=${encoded}`).catch(() =>
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
      );
    });
  }
}

export default function MapScreen() {
  const { theme, themeName } = useAppTheme();
  const { formatDistance, formatLabel } = useDistanceFormatter();
  const mapRef = useRef<MapView>(null);

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);

  // Animation for bottom sheet
  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Determine map style based on theme
  const isDarkTheme = themeName !== 'melon_fresh';
  const currentMapStyle = isDarkTheme ? darkMapStyle : lightMapStyle;

  useEffect(() => {
    initMap();
  }, []);

  const initMap = async () => {
    setIsLoading(true);
    const [coords, savedRadius] = await Promise.all([
      getLocation(),
      getSearchRadius()
    ]);

    const initialRadius = Math.min(savedRadius, MAX_RADIUS_METERS);
    setRadius(initialRadius);

    if (coords) {
      const initialRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05 * (width / height),
      };
      setRegion(initialRegion);
      loadRestaurants(coords.latitude, coords.longitude, initialRadius);
    }
  };

  const loadRestaurants = async (lat: number, lng: number, r: number) => {
    setIsLoading(true);
    try {
      // Try cache first
      const cached = await getCachedResults(MAP_RESULTS_KEY);
      if (cached && cached.length > 0) {
        setRestaurants(cached);
        setIsLoading(false);
        return;
      }

      const results = await getNearbyRestaurants(lat, lng, r);
      await setCachedResults(MAP_RESULTS_KEY, results);
      setRestaurants(results);
    } catch (error) {
      console.error('Error loading restaurants for map:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRegionChangeComplete = (newRegion: Region) => {
    if (newRegion.latitudeDelta > MAX_DELTA) {
      mapRef.current?.animateToRegion({
        ...newRegion,
        latitudeDelta: MAX_DELTA,
        longitudeDelta: MAX_DELTA * (width / height),
      });
    }
    setRegion(newRegion);
  };

  const handleMarkerPress = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
    Animated.spring(sheetAnim, {
      toValue: height * 0.58,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setSelectedRestaurant(null));
  };

  const handleRadiusChange = async (newRadius: number) => {
    const clamped = Math.min(newRadius, MAX_RADIUS_METERS);
    setRadius(clamped);
    await setSearchRadius(clamped);
    setShowRadiusPicker(false);
    if (region) {
      loadRestaurants(region.latitude, region.longitude, clamped);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkTheme ? '#1E0F1E' : '#FDF8F5' }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region || undefined}
        onRegionChangeComplete={onRegionChangeComplete}
        mapType="standard"
        showsUserLocation
        showsPointsOfInterest={false}
        showsCompass={false}
        customMapStyle={currentMapStyle}
      >
        {restaurants.map((item) => {
          const score = calculatePlateboundScore(item.aiOverview, item.rating, item.priceLevel);
          return (
            <Marker
              key={item.id}
              coordinate={{
                latitude: item.location.latitude,
                longitude: item.location.longitude,
              }}
              onPress={() => handleMarkerPress(item)}
              tracksViewChanges={false}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerBubble, { backgroundColor: theme.accent }]}>
                  <Text style={styles.markerScore}>{score > 0 ? score : 'N/A'}</Text>
                </View>
                <View style={[styles.markerArrow, { borderBottomColor: theme.accent }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Dynamic Header Gradient based on theme brightness */}
      <LinearGradient
        colors={[isDarkTheme ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)', 'transparent']}
        style={styles.headerGradient}
      />

      <TopProfileButton />

      <SafeAreaView style={styles.overlayUI} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: theme.text, textShadowColor: isDarkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>Explore</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.radiusBtn, { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          onPress={() => setShowRadiusPicker(!showRadiusPicker)}
        >
          <Ionicons name="location" size={18} color={theme.accent} />
          <Text style={[styles.radiusText, { color: theme.text }]}>
            {formatLabel(radius)} Radius
          </Text>
          <Ionicons name={showRadiusPicker ? "chevron-up" : "chevron-down"} size={16} color={theme.subtext} />
        </TouchableOpacity>

        {showRadiusPicker && (
          <View style={[styles.pickerContainer, { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            {[1000, 2000, 4000, 6000, 8046].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.pickerOption,
                  { borderColor: isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' },
                  radius === r && { backgroundColor: theme.accent, borderColor: theme.accent }
                ]}
                onPress={() => handleRadiusChange(r)}
              >
                <Text style={[styles.pickerOptionText, { color: theme.text }, radius === r && { color: '#FFF' }]}>
                  {formatLabel(r)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>

      {/* Bottom Sheet for Restaurant Overview */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: theme.cardBackground,
            transform: [{ translateY: sheetAnim }],
            shadowColor: isDarkTheme ? '#000' : '#444',
          },
        ]}
      >
        <View style={styles.sheetHandleContainer}>
          <TouchableOpacity 
            activeOpacity={0.6}
            onPress={closeSheet} 
            style={styles.sheetHandle} 
            style={[styles.sheetHandle, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}
          />
        </View>

        {selectedRestaurant && (
          <ScrollView 
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.restaurantName, { color: theme.text }]}>
                  {selectedRestaurant.displayName?.text}
                </Text>
                <Text style={[styles.restaurantType, { color: theme.subtext }]}>
                  {selectedRestaurant.primaryType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Restaurant'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeSheet} style={[styles.closeBtn, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={[styles.metaText, { color: theme.text }]}>{selectedRestaurant.rating?.toFixed(1) || 'N/A'}</Text>
              </View>
              <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="navigate-outline" size={14} color="#F9A06F" />
                <Text style={[styles.metaText, { color: theme.text }]}>{formatDistance(selectedRestaurant.distanceMeters)} away</Text>
              </View>
              <View style={[styles.metaPill, { borderColor: 'rgba(76,217,100,0.3)', backgroundColor: 'transparent' }]}>
                <Ionicons name="time-outline" size={14} color="#4CD964" />
                <Text style={[styles.metaText, { color: '#4CD964' }]}>Open</Text>
              </View>
            </View>

            <View style={styles.imageContainer}>
              <RestaurantImage
                restaurantId={selectedRestaurant.id}
                photos={selectedRestaurant.photos}
                width={width - 40}
                height={180}
                borderRadius={20}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionBtn, { backgroundColor: theme.accent }]}
              onPress={() => openMaps(
                selectedRestaurant.displayName?.text,
                selectedRestaurant.location.latitude,
                selectedRestaurant.location.longitude
              )}
            >
              <Ionicons name="map" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Get Directions</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const darkMapStyle = [
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
  { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "administrative.land_parcel", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#181818" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "poi.park", "elementType": "labels.text.stroke", "stylers": [{ "color": "#1b1b1b" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#373737" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
  { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#4e4e4e" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "transit", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#3d3d3d" }] }
];

const lightMapStyle = [
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  headerGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 1,
  },
  overlayUI: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 20, zIndex: 2,
  },
  headerRow: { marginTop: 60, alignItems: 'center', marginBottom: 20 },
  pageTitle: {
    fontSize: 28, fontWeight: '900', letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  markerBubble: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 2, borderColor: '#FFF',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  markerScore: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  markerArrow: {
    width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid',
    borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent',
    transform: [{ rotate: '180deg' }], marginTop: -2,
  },
  radiusBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 10, borderWidth: 1,
  },
  radiusText: { fontSize: 16, fontWeight: '700' },
  pickerContainer: {
    marginTop: 15, alignSelf: 'center', borderRadius: 25, padding: 15, flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 10, width: '100%', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 12, borderWidth: 1,
  },
  pickerOption: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pickerOptionText: { fontSize: 14, fontWeight: '600' },
  bottomSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.42, borderTopLeftRadius: 40, borderTopRightRadius: 40,
    shadowOpacity: 0.6, shadowRadius: 25, shadowOffset: { width: 0, height: -10 }, elevation: 25, zIndex: 1000,
  },
  sheetHandleContainer: { alignItems: 'center', paddingVertical: 15 },
  sheetHandle: { width: 60, height: 6, borderRadius: 3 },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  restaurantName: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  restaurantType: { fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  metaText: { fontSize: 14, fontWeight: '600' },
  imageContainer: {
    marginBottom: 25, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 8 },
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 20, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  actionBtnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
});
