import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, ScrollView, Animated, PanResponder, Linking } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

// Maps a primaryType string to an Ionicons icon name
function getCuisineIcon(primaryType?: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (!primaryType) return 'restaurant';
  const t = primaryType.toLowerCase();
  if (t.includes('pizza')) return 'pizza';
  if (t.includes('coffee') || t.includes('cafe') || t.includes('cafeteria')) return 'cafe';
  if (t.includes('bar') || t.includes('pub') || t.includes('brewery')) return 'beer';
  if (t.includes('bakery') || t.includes('dessert') || t.includes('ice_cream')) return 'ice-cream';
  if (t.includes('fast_food') || t.includes('hamburger')) return 'fast-food';
  if (t.includes('seafood') || t.includes('sushi') || t.includes('fish')) return 'fish';
  if (t.includes('sandwich') || t.includes('sub')) return 'nutrition-outline';
  return 'restaurant';
}

// Marker component with deferred tracksViewChanges=false to ensure initial render.
// The outer shadowWrapper absorbs the Android elevation shadow space so the
// native layer doesn't clip the pill shape.
function RestaurantMarker({ item, accentColor, displayScore, onPress }: {
  item: any; accentColor: string; displayScore: string | number; onPress: () => void;
}) {
  const [tracked, setTracked] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracked(false), 800);
    return () => clearTimeout(t);
  }, []);
  const icon = getCuisineIcon(item.primaryType);
  return (
    <Marker
      coordinate={{ latitude: item.location.latitude, longitude: item.location.longitude }}
      onPress={onPress}
      tracksViewChanges={tracked}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View style={styles.markerHitFrame} collapsable={false}>
        <View style={styles.markerShadowWrapper}>
          <View style={styles.markerContainer}>
            <View style={[styles.markerBody, { backgroundColor: '#1A0A1A', borderColor: accentColor }]}>
              <Ionicons name={icon} size={14} color={accentColor} />
              <Text style={styles.markerScoreText}>{displayScore}</Text>
            </View>
            <View style={[styles.markerTip, { borderTopColor: accentColor }]} />
          </View>
        </View>
      </View>
    </Marker>
  );
}

const { width, height } = Dimensions.get('window');
const MAP_RESULTS_KEY = 'map_results';
const MAX_MILES = 10;
const MAX_RADIUS_METERS = 16093.4; // 10 miles
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
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [locationProgress] = useState(new Animated.Value(0));
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);

  // Animation for bottom sheet
  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Determine map style - Force Dark as requested
  const currentMapStyle = darkMapStyle;
  const isDarkTheme = themeName !== 'melon_fresh'; // Still used for UI elements

  useEffect(() => {
    initMap();
  }, []);

  const initMap = async () => {
    setIsLocating(true);
    
    // Start progress bar animation
    Animated.timing(locationProgress, {
      toValue: 0.9,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    const [coords, savedRadius] = await Promise.all([
      getLocation(),
      getSearchRadius()
    ]);

    const initialRadius = Math.min(savedRadius, MAX_RADIUS_METERS);
    setRadius(initialRadius);

    if (coords) {
      // Finish progress
      Animated.timing(locationProgress, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start(() => {
        setIsLocating(false);
      });

      setUserCoords(coords);
      setSearchCenter(coords);
      
      const initialRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02 * (width / height),
      };
      setRegion(initialRegion);
      
      // Auto-zoom/animate to location immediately
      mapRef.current?.animateToRegion(initialRegion, 1000);
      
      loadRestaurants(coords.latitude, coords.longitude, initialRadius);
    } else {
      setIsLocating(false);
    }
  };

  const loadRestaurants = async (lat: number, lng: number, r: number) => {
    setIsLoading(true);
    setSearchCenter({ latitude: lat, longitude: lng });
    const cacheKey = `${MAP_RESULTS_KEY}_${Math.round(r)}`;
    try {
      const cached = await getCachedResults(cacheKey);
      if (cached && cached.length > 0) {
        setRestaurants(cached);
        setIsLoading(false);
        return;
      }

      setRestaurants([]);
      const results = await getNearbyRestaurants(lat, lng, r);
      await setCachedResults(cacheKey, results);
      setRestaurants(results);
    } catch (error) {
      console.error('Error loading restaurants for map:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRegionChangeComplete = (newRegion: Region) => {
    setRegion(newRegion);
  };

  const centerToUser = () => {
    if (userCoords) {
      mapRef.current?.animateToRegion({
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015 * (width / height),
      }, 800);
    }
  };

  // PanResponder for Swipeable Bottom Sheet
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderMove: (_, gestureState) => {
        const newValue = (selectedRestaurant ? height * 0.45 : height) + gestureState.dy;
        if (newValue > height * 0.1 && newValue < height) {
          sheetAnim.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -50) {
          // Swipe Up - Full(ish) height
          Animated.spring(sheetAnim, {
            toValue: height * 0.15,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        } else if (gestureState.dy > 100) {
          // Swipe Down - Close
          closeSheet();
        } else {
          // Snap back to mid
          Animated.spring(sheetAnim, {
            toValue: height * 0.45,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const handleMarkerPress = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
    // Move map to center on restaurant slightly offset
    mapRef.current?.animateToRegion({
      latitude: restaurant.location.latitude - (region?.latitudeDelta || 0.015) * 0.25,
      longitude: restaurant.location.longitude,
      latitudeDelta: region?.latitudeDelta || 0.015,
      longitudeDelta: region?.longitudeDelta || 0.015 * (width / height),
    }, 400);

    Animated.spring(sheetAnim, {
      toValue: height * 0.45,
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
        showsMyLocationButton={false}
        toolbarEnabled={false}
        customMapStyle={currentMapStyle}
        loadingEnabled={false}
      >
        {searchCenter && (
          <Circle
            center={searchCenter}
            radius={radius}
            fillColor={theme.accent + '22'}
            strokeColor={theme.accent}
            strokeWidth={2}
          />
        )}
        {restaurants.map((item) => {
          const score = calculatePlateboundScore(item.aiOverview, item.rating, item.priceLevel);
          const displayScore = score > 0 ? score : (item.rating ? (item.rating * 2).toFixed(1) : 'N/A');
          return (
            <RestaurantMarker
              key={item.id}
              item={item}
              accentColor={theme.accent}
              displayScore={displayScore}
              onPress={() => handleMarkerPress(item)}
            />
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

        {/* Radius Picker - compact top-left */}
        <View style={styles.radiusArea} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.radiusBtn, { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            onPress={() => setShowRadiusPicker(!showRadiusPicker)}
          >
            <Ionicons name="locate" size={14} color={theme.accent} />
            <Text style={[styles.radiusText, { color: theme.text }]}>{formatLabel(radius)}</Text>
            <Ionicons name={showRadiusPicker ? 'chevron-up' : 'chevron-down'} size={12} color={theme.subtext} />
          </TouchableOpacity>

          {showRadiusPicker && (
            <View style={[styles.pickerContainer, { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              {[1000, 2000, 4000, 8000, 16000].map((r) => (
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
        </View>

        {/* Home Button - Bottom Left */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.homeBtn, { backgroundColor: theme.cardBackground }]}
          onPress={centerToUser}
        >
          <Ionicons name="home" size={24} color={theme.accent} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Loading Overlay */}
      {isLocating && (
        <View style={[styles.loadingOverlay, { backgroundColor: isDarkTheme ? '#1E0F1E' : '#FDF8F5' }]}>
          <View style={styles.loadingContent}>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>Acquiring GPS Lock</Text>
            <Text style={[styles.loadingSubtitle, { color: theme.subtext }]}>Finding your culinary coordinates...</Text>
            <View style={[styles.progressBarContainer, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Animated.View 
                style={[
                  styles.progressBar, 
                  { 
                    backgroundColor: theme.accent,
                    width: locationProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]} 
              />
            </View>
          </View>
        </View>
      )}

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
        <View style={styles.sheetHandleContainer} {...panResponder.panHandlers}>
          <TouchableOpacity 
            activeOpacity={0.6}
            onPress={closeSheet} 
            style={[styles.sheetHandle, { backgroundColor: 'rgba(255,255,255,0.3)' }]}
          />
        </View>

        {selectedRestaurant && (
          <ScrollView
            style={styles.sheetScrollView}
            contentContainerStyle={[
              styles.sheetContent,
              {
                paddingBottom: Math.max(insets.bottom, 20) + 72,
              },
            ]}
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
              {PRICE_MAP[selectedRestaurant.priceLevel] && (
                <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={[styles.metaText, { color: '#F9A06F' }]}>{PRICE_MAP[selectedRestaurant.priceLevel]}</Text>
                </View>
              )}
              <View style={[styles.metaPill, { borderColor: selectedRestaurant.currentOpeningHours?.openNow ? 'rgba(76,217,100,0.3)' : 'rgba(255,107,107,0.3)', backgroundColor: 'transparent' }]}>
                <Ionicons name={selectedRestaurant.currentOpeningHours?.openNow ? 'checkmark-circle-outline' : 'close-circle-outline'} size={14} color={selectedRestaurant.currentOpeningHours?.openNow ? '#4CD964' : '#FF6B6B'} />
                <Text style={[styles.metaText, { color: selectedRestaurant.currentOpeningHours?.openNow ? '#4CD964' : '#FF6B6B' }]}>{selectedRestaurant.currentOpeningHours?.openNow ? 'Open' : 'Closed'}</Text>
              </View>
            </View>

            {/* Open in Maps — at the top of the panel */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionBtn, { backgroundColor: theme.accent, marginBottom: 14 }]}
              onPress={() => openMaps(
                selectedRestaurant.displayName?.text,
                selectedRestaurant.location.latitude,
                selectedRestaurant.location.longitude
              )}
            >
              <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={18} color="#FFF" />
              <Text style={styles.actionBtnText}>{Platform.OS === 'ios' ? 'Open in Apple Maps' : 'Open in Google Maps'}</Text>
            </TouchableOpacity>

            <View style={styles.imageContainer}>
              <RestaurantImage
                restaurantId={selectedRestaurant.id}
                photos={selectedRestaurant.photos}
                width={width - 40}
                height={180}
                borderRadius={20}
              />
            </View>

            {selectedRestaurant.formattedAddress ? (
              <View style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="location-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>Address</Text>
                </View>
                <Text style={[styles.infoSectionBody, { color: theme.subtext }]}>{selectedRestaurant.formattedAddress}</Text>
              </View>
            ) : null}

            {/* Health Score — directly below address */}
            <View style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
              <View style={styles.infoSectionHeader}>
                <Ionicons name="heart-outline" size={15} color="#A8D5A2" />
                <Text style={[styles.infoSectionTitle, { color: '#A8D5A2' }]}>Health Score</Text>
                <Text style={[styles.metaText, { color: theme.subtext }]}>
                  {typeof selectedRestaurant.aiOverview?.healthScore === 'number' ? `${selectedRestaurant.aiOverview.healthScore}/10` : 'Pending'}
                </Text>
              </View>
              <View style={styles.healthBar}>
                <View style={[styles.healthFill, { width: `${((selectedRestaurant.aiOverview?.healthScore ?? 0) / 10) * 100}%` as any }]} />
              </View>
            </View>

            {selectedRestaurant.nationalPhoneNumber ? (
              <TouchableOpacity style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]} onPress={() => Linking.openURL(`tel:${selectedRestaurant.nationalPhoneNumber}`)}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="call-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>Phone</Text>
                  <Ionicons name="open-outline" size={12} color={theme.subtext} />
                </View>
                <Text style={[styles.infoSectionBody, { color: '#F9A06F' }]}>{selectedRestaurant.nationalPhoneNumber}</Text>
              </TouchableOpacity>
            ) : null}

            {(selectedRestaurant.currentOpeningHours?.weekdayDescriptions?.length > 0) ? (
              <View style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="time-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>Hours</Text>
                </View>
                {selectedRestaurant.currentOpeningHours.weekdayDescriptions.map((line: string, i: number) => {
                  const todayIdx = (new Date().getDay() + 6) % 7;
                  return (
                    <Text key={i} style={[styles.infoSectionBody, { color: i === todayIdx ? '#4CD964' : theme.subtext, fontWeight: i === todayIdx ? '700' : '400' }]}>{line}</Text>
                  );
                })}
              </View>
            ) : null}

            {selectedRestaurant.aiOverview ? (
              <View style={[styles.infoSection, { borderColor: 'rgba(201,160,255,0.15)' }]}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="sparkles-outline" size={15} color="#C9A0FF" />
                  <Text style={[styles.infoSectionTitle, { color: '#C9A0FF' }]}>AI Overview</Text>
                </View>
                <Text style={[styles.infoSectionBody, { color: theme.subtext }]}>{selectedRestaurant.aiOverview.summaryGoodBad}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[
                    { label: `Convenience Speed ${selectedRestaurant.aiOverview.speedScore}/5`, color: '#F9A06F' },
                    { label: `Health ${selectedRestaurant.aiOverview.healthScore}/10`, color: '#4CD964' },
                    { label: `Recovery ${selectedRestaurant.aiOverview.workoutRecoveryScore}/10`, color: '#64D9D9' },
                    { label: `Processed ${selectedRestaurant.aiOverview.processedScore}/10`, color: '#FF6B6B' },
                    { label: `Date ${selectedRestaurant.aiOverview.dateWorthiness}/5`, color: '#FFD700' },
                    { label: `Noise ${selectedRestaurant.aiOverview.noiseLevelEstimate}/5`, color: '#C9A0FF' },
                  ].map(({ label, color }) => (
                    <View key={label} style={[styles.metaPill, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }]}>
                      <Text style={[styles.metaText, { color }]}>{label}</Text>
                    </View>
                  ))}
                </View>
                {selectedRestaurant.aiOverview.whoThisPlaceIsFor ? (
                  <Text style={[styles.infoSectionBody, { color: theme.subtext, marginTop: 8, fontStyle: 'italic' }]}>{selectedRestaurant.aiOverview.whoThisPlaceIsFor}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={{ height: 28 }} />
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
  headerRow: { marginTop: 12, alignItems: 'center', marginBottom: 10 },
  pageTitle: {
    fontSize: 28, fontWeight: '900', letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  markerHitFrame: {
    width: 140,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  markerShadowWrapper: { padding: 8, overflow: 'visible' },
  markerContainer: { alignItems: 'center' },
  markerBody: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 2.5,
    shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  markerScoreText: { fontSize: 15, fontWeight: '900', color: '#FFF', letterSpacing: -0.3 },
  markerTip: {
    width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid',
    borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
  radiusArea: { alignSelf: 'flex-start', marginTop: 4 },
  radiusBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 5,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderWidth: 1,
  },
  radiusText: { fontSize: 12, fontWeight: '700' },
  pickerContainer: {
    marginTop: 6, borderRadius: 16, padding: 10, flexDirection: 'column',
    gap: 6, width: 130, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 12, borderWidth: 1,
  },
  pickerOption: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pickerOptionText: { fontSize: 12, fontWeight: '600' },
  bottomSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.85, borderTopLeftRadius: 40, borderTopRightRadius: 40,
    shadowOpacity: 0.6, shadowRadius: 25, shadowOffset: { width: 0, height: -10 }, elevation: 25, zIndex: 10000,
    overflow: 'hidden',
  },
  sheetHandleContainer: { alignItems: 'center', paddingVertical: 15 },
  sheetHandle: { width: 60, height: 6, borderRadius: 3 },
  sheetScrollView: { flex: 1 },
  sheetContent: { paddingHorizontal: 24, flexGrow: 1 },
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
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  infoSection: {
    marginBottom: 10, backgroundColor: 'rgba(30,15,30,0.45)',
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  infoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  infoSectionTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  infoSectionBody: { fontSize: 13, lineHeight: 19 },
  healthBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  healthFill: { height: '100%', backgroundColor: '#4CD964', borderRadius: 3 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    width: '80%',
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 30,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  homeBtn: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});
