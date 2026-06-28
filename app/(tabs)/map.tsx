import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import { StyleSheet, View, Text, Dimensions, Platform, ScrollView, Animated, PanResponder, Linking, ActivityIndicator } from 'react-native';
import { FlatList, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Slider from '@react-native-community/slider';
import MapView, { Circle, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { AiOverviewSummaryBody } from '@/components/AiOverviewSummaryBody';
import { useAppTheme } from '@/context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { consumeMapFocusRestaurant } from '@/core/currentSelection';
import { getLocation, subscribeLocationUpdates, distanceBetweenMeters } from '@/core/locationCache';
import {
  getNearbyRestaurants,
  isRestaurantFetchError,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { AI_OVERVIEW_FIELD_PLACEHOLDER, type AiOverview } from '@/core/aiOverviewCache';
import {
  DEFAULT_SEARCH_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
  MIN_SEARCH_RADIUS_METERS,
  radiusToSliderValue,
  sliderValueToRadius,
} from '@/core/searchRadiusOptions';
import { RestaurantCarousel } from '@/components/RestaurantCarousel';
import { TranslatedText } from '@/components/ui/TranslatedText';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { calculatePlateboundScore } from '@/core/ratingCalculator';
import { formatPlacePriceLabel } from '@/core/placePriceLabel';
import { isOpenNow } from '@/core/isOpenNow';
import { RestaurantMapMarker } from '@/components/map/RestaurantMapMarker';
import { markerIconForPlace } from '@/core/markerIcons';
import * as Clipboard from 'expo-clipboard';
import type { RandomSortBy } from '@/core/randomPickerState';
import {
  SORT_OPTIONS,
  compareRestaurantsBySort,
  getSortValue,
  mapMarkerScoreColor,
  mapSortRawHigherIsGreener,
} from '@/core/restaurantSort';
import { tScoreLabel, tSortLabel, formatWeekdayHours } from '@/core/i18nLabels';
import { scoreWithLoadedPrefs } from '@/core/recommendationEngine';

function formatMarkerSortLabel(item: any, sortBy: RandomSortBy, formatDistance: (meters: number) => string): string {
  if (sortBy === 'matchScore') return item.matchScore != null ? `${Math.round(item.matchScore)}%` : '—';
  if (sortBy === 'distance') return formatDistance(item.distanceMeters ?? 0);
  if (sortBy === 'price') return formatPlacePriceLabel(item) || '—';
  if (sortBy === 'rating') {
    return typeof item.rating === 'number' && item.rating > 0 ? item.rating.toFixed(1) : '—';
  }
  if (sortBy === 'overall') {
    if (!item.aiOverview) return '—';
    const s = calculatePlateboundScore(item.aiOverview, item.rating, item.priceLevel, item.userRatingCount);
    return s.toFixed(1);
  }
  const raw = getSortValue(item, sortBy);
  return raw >= 0 ? raw.toFixed(1) : '—';
}

type MapThemeSlice = { text: string; subtext: string; accent: string };

function MapSheetAiScores({
  ai,
  ph,
  isDark,
  theme,
  overallScore,
  overallPh,
}: {
  ai?: AiOverview | null;
  ph: boolean;
  isDark: boolean;
  theme: MapThemeSlice;
  overallScore: number | null;
  overallPh: boolean;
}) {
  const { t } = useTranslation();
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const num = (x: number | undefined) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const scoreColor5 = (val: number | undefined) => {
    if (ph || val == null) return theme.text;
    const n = num(val);
    if (n >= 3.5) return '#4CD964';
    if (n < 2.5) return '#FF6B6B';
    return '#FF9500';
  };
  const scoreColor10 = (val: number | undefined) => {
    if (ph || val == null) return theme.accent;
    const n = num(val);
    if (n >= 7) return '#4CD964';
    if (n < 5) return '#FF6B6B';
    return '#FF9500';
  };
  const sq = (emoji: string, label: string, val: number | undefined, k: string) => (
    <View key={k} style={[styles.aiSquare, { borderColor: border }]}>
      <Text style={styles.aiSquareEmoji}>{emoji}</Text>
      <Text style={[styles.aiSquareLabel, { color: theme.subtext }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.aiSquareVal, { color: scoreColor5(val) }]}>
        {ph ? AI_OVERVIEW_FIELD_PLACEHOLDER : `${num(val).toFixed(1)}/5`}
      </Text>
    </View>
  );
  const bar10 = (label: string, val: number | undefined, k: string) => {
    const n = ph ? 0 : num(val);
    const pct = Math.max(0, Math.min(1, n / 10));
    const barColor = scoreColor10(val);
    return (
      <View key={k} style={[styles.aiBarCard, { borderColor: border }]}>
        <View style={styles.aiBarTop}>
          <Text style={[styles.aiBarTitle, { color: theme.text }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.aiBarNum, { color: barColor }]}>
            {ph ? AI_OVERVIEW_FIELD_PLACEHOLDER : `${n.toFixed(1)}/10`}
          </Text>
        </View>
        <View style={[styles.aiBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          <View style={[styles.aiBarFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    );
  };
  const groupText = ph
    ? AI_OVERVIEW_FIELD_PLACEHOLDER
    : ai?.groupSizeSweetSpot != null
      ? t('common.people', { count: ai.groupSizeSweetSpot })
      : t('common.missingScore');
  return (
    <View style={[styles.infoSection, { borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
      <View style={styles.infoSectionHeader}>
        <Ionicons name="analytics-outline" size={15} color="#C9A0FF" />
        <Text style={[styles.infoSectionTitle, { color: '#C9A0FF' }]}>{t('map.aiScores')}</Text>
      </View>
      <View style={[styles.aiOverallRow, { borderColor: border }]}>
        <View style={styles.aiOverallLeft}>
          <Ionicons name="ribbon-outline" size={18} color="#C9A0FF" />
          <Text style={[styles.aiOverallLabel, { color: theme.subtext }]}>{t('map.overallScore')}</Text>
        </View>
        <Text style={[styles.aiOverallVal, { color: overallPh || overallScore == null ? theme.text : overallScore >= 7 ? '#4CD964' : overallScore < 5 ? '#FF6B6B' : '#FF9500' }]}>
          {overallPh ? AI_OVERVIEW_FIELD_PLACEHOLDER : overallScore != null ? `${overallScore.toFixed(1)}/10` : t('common.missingScore')}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.aiStripRow}
      >
        {sq('👅', tScoreLabel('taste'), ai?.tasteScore, 'taste')}
        {sq('💵', tScoreLabel('value'), ai?.valueForMoneyScore, 'value')}
        {bar10(tScoreLabel('health'), ai?.healthScore, 'health')}
        {sq('⏱️', tScoreLabel('speed'), ai?.speedScore, 'speed')}
        {bar10(tScoreLabel('workoutRecovery'), ai?.workoutRecoveryScore, 'workout')}
        {bar10(tScoreLabel('processedLoad'), ai?.processedScore, 'processed')}
        {sq('🌙', tScoreLabel('munchy'), ai?.munchyScore, 'munchy')}
        {sq('🔄', tScoreLabel('variety'), ai?.varietyScore, 'variety')}
        {sq('🔥', tScoreLabel('calorieFit'), ai?.calorieScore, 'calorie')}
        {sq('🥩', tScoreLabel('protein'), ai?.proteinScore, 'protein')}
        {sq('🌾', tScoreLabel('carbBalance'), ai?.carbScore, 'carb')}
        {sq('📊', tScoreLabel('macroFriendly'), ai?.macroFriendlyScore, 'macro')}
        {sq('🥴', tScoreLabel('hungover'), ai?.hungoverRecoveryScore, 'hungover')}
        {sq('💕', tScoreLabel('dateWorthiness'), ai?.dateWorthiness, 'date')}
        {sq('🔊', tScoreLabel('noiseLevel'), ai?.noiseLevelEstimate, 'noise')}
        <View key="group" style={[styles.aiSquare, { borderColor: border, minWidth: 88 }]}>
          <Text style={styles.aiSquareEmoji}>👥</Text>
          <Text style={[styles.aiSquareLabel, { color: theme.subtext }]} numberOfLines={2}>
            {tScoreLabel('groupSweetSpot')}
          </Text>
          <Text style={[styles.aiSquareVal, { color: theme.text }]} numberOfLines={1}>
            {groupText}
          </Text>
        </View>
        {sq('🪑', tScoreLabel('soloDinerFriendly'), ai?.soloDinerScore, 'solo')}
        {sq('🔋', tScoreLabel('energySustain'), ai?.energySustainScore, 'energy')}
        {sq('💻', tScoreLabel('workFriendly'), ai?.workFriendlyScore, 'work')}
      </ScrollView>
      {ph ? (
        <Text style={[styles.infoSectionBody, { color: theme.subtext, marginTop: 10 }]}>
          {AI_OVERVIEW_FIELD_PLACEHOLDER}
        </Text>
      ) : ai?.absoluteMacros ? (
        <TranslatedText text={ai.absoluteMacros} style={[styles.macrosBlock, { color: theme.subtext }]} />
      ) : null}
    </View>
  );
}

const { width, height } = Dimensions.get('window');
let mapSessionInitialized = false;
let mapSessionAllRestaurants: any[] = [];
let mapSessionRadius = DEFAULT_SEARCH_RADIUS_METERS;
let mapSessionFetchedRadius = DEFAULT_SEARCH_RADIUS_METERS;
let mapSessionUserCoords: { latitude: number; longitude: number } | null = null;
let mapSessionInitialCoords: { latitude: number; longitude: number } | null = null;
let mapSessionRegion: Region | null = null;

const MAP_LOCATION_REFRESH_METERS = 120;

function markerInRegion(lat: number, lng: number, reg: Region): boolean {
  const halfLat = reg.latitudeDelta / 2;
  const halfLng = reg.longitudeDelta / 2;
  return (
    lat >= reg.latitude - halfLat &&
    lat <= reg.latitude + halfLat &&
    lng >= reg.longitude - halfLng &&
    lng <= reg.longitude + halfLng
  );
}

function finiteMapColorBounds(items: any[], sortBy: RandomSortBy): { min: number; max: number } | null {
  const vals = items
    .map((r) => mapSortRawHigherIsGreener(r, sortBy))
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (vals.length === 0) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function mapColorT(raw: number, bounds: { min: number; max: number } | null): number {
  if (!Number.isFinite(raw) || !bounds) return 0.5;
  if (bounds.max > bounds.min) {
    return Math.max(0, Math.min(1, (raw - bounds.min) / (bounds.max - bounds.min)));
  }
  return 0.5;
}

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
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const { formatDistance, formatLabel } = useDistanceFormatter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const selectedRestaurantRef = useRef<any | null>(null);
  const sheetSnapRef = useRef<'peek' | 'full'>('peek');
  const regionRef = useRef<Region | null>(mapSessionRegion);

  const [allRestaurants, setAllRestaurants] = useState<any[]>(mapSessionAllRestaurants);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any | null>(null);
  const [region, setRegion] = useState<Region | null>(mapSessionRegion);
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number } | null>(mapSessionUserCoords);
  const [isLoading, setIsLoading] = useState(allRestaurants.length === 0);
  const [isLocating, setIsLocating] = useState(!mapSessionInitialized);
  const [locationProgress] = useState(new Animated.Value(mapSessionInitialized ? 1 : 0));
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(mapSessionUserCoords);
  const [radius, setRadius] = useState(mapSessionRadius);
  const [sliderRadius, setSliderRadius] = useState(mapSessionRadius);

  useEffect(() => {
    setSliderRadius(radius);
  }, [radius]);

  const restaurantsRef = useRef<any[]>([]);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const [mapSortBy, setMapSortBy] = useState<RandomSortBy>('matchScore');
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [hideClosed, setHideClosed] = useState(false);
  const [openStatusEpoch, setOpenStatusEpoch] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('map_hide_closed').then(val => {
      if (val != null) {
        setHideClosed(JSON.parse(val));
      }
    });
  }, []);
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'full'>('peek');

  selectedRestaurantRef.current = selectedRestaurant;
  sheetSnapRef.current = sheetSnap;

  // Animation for bottom sheet
  const sheetAnim = useRef(new Animated.Value(height)).current;

  // Determine map style — light themes use the default (white) Google map
  const isLightTheme = Boolean(theme.screenBackground);
  const isDarkTheme = !isLightTheme;
  const currentMapStyle = isLightTheme ? undefined : darkMapStyle;
  const screenBg = theme.screenBackground ?? (isDarkTheme ? '#1E0F1E' : '#FDF8F5');

  const withSelectedRestaurant = useCallback((list: any[]) => {
    const selected = selectedRestaurantRef.current;
    if (selected?.id && !list.some((r) => r.id === selected.id)) {
      return [...list, selected];
    }
    return list;
  }, []);

  const restaurants = useMemo(() => {
    const source = allRestaurants ?? [];
    let filtered = source.filter((r) => (r.distanceMeters ?? Infinity) <= radius);
    if (hideClosed) {
      filtered = filtered.filter(r => isOpenNow(r));
    }
    return withSelectedRestaurant(filtered);
  }, [allRestaurants, radius, hideClosed, withSelectedRestaurant]);

  restaurantsRef.current = restaurants;

  const sortedMarkers = useMemo(
    () => [...restaurants].sort((a, b) => compareRestaurantsBySort(a, b, mapSortBy)),
    [restaurants, mapSortBy]
  );

  const markersInMapView = useMemo(() => {
    if (!region) return sortedMarkers;
    return sortedMarkers.filter((item) =>
      markerInRegion(item.location.latitude, item.location.longitude, region)
    );
  }, [sortedMarkers, region]);

  const markerColorBounds = useMemo(() => {
    return finiteMapColorBounds(markersInMapView, mapSortBy);
  }, [markersInMapView, mapSortBy]);

  const commitAllRestaurants = useCallback((next: any[]) => {
    mapSessionAllRestaurants = next ?? [];
    setAllRestaurants(next ?? []);
  }, []);

  const loadRestaurants = useCallback(async (lat: number, lng: number, fetchRadius: number) => {
    setIsLoading(true);
    setSearchCenter({ latitude: lat, longitude: lng });
    try {
      const results = await getNearbyRestaurants(lat, lng, fetchRadius, undefined, {
        onAiReady: async (enriched) => {
          mapSessionFetchedRadius = fetchRadius;
          const scored = await scoreWithLoadedPrefs(enriched, { radiusMeters: fetchRadius } as any, lat, lng, undefined, true);
          const placesWithMatchScore = scored.map(s => ({ ...s.place, matchScore: s.plateboundScore }));
          commitAllRestaurants(placesWithMatchScore);
          setSelectedRestaurant((prev: any) => {
            if (!prev) return null;
            const next = placesWithMatchScore.find((x: any) => x.id === prev.id);
            return next ?? prev;
          });
        },
      });
      mapSessionFetchedRadius = fetchRadius;
      const finalScored = await scoreWithLoadedPrefs(results, { radiusMeters: fetchRadius } as any, lat, lng, undefined, true);
      const finalWithMatchScore = finalScored.map(s => ({ ...s.place, matchScore: s.plateboundScore }));
      commitAllRestaurants(finalWithMatchScore);
    } catch (error) {
      if (isRestaurantLoadSupersededError(error)) {
        return;
      }
      if (isRestaurantFetchError(error)) {
        if (__DEV__) console.warn('[restaurants]', error.message, error.cause);
        return;
      }
      console.warn('Error loading restaurants for map:', error);
    } finally {
      setIsLoading(false);
      setOpenStatusEpoch((e) => e + 1);
    }
  }, [commitAllRestaurants]);

  const applyMapLocationUpdate = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      const baseline = mapSessionInitialCoords;
      if (!baseline) {
        return;
      }
      if (distanceBetweenMeters(baseline, coords) < MAP_LOCATION_REFRESH_METERS) {
        return;
      }

      mapSessionUserCoords = coords;
      setUserCoords(coords);
      setSearchCenter(coords);

      const currentRegion = regionRef.current;
      const nextRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: currentRegion?.latitudeDelta ?? 0.02,
        longitudeDelta: currentRegion?.longitudeDelta ?? 0.02 * (width / height),
      };
      mapSessionRegion = nextRegion;
      regionRef.current = nextRegion;
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 800);

      const fetchRadius = Math.max(mapSessionFetchedRadius, radius);
      void loadRestaurants(coords.latitude, coords.longitude, fetchRadius);
    },
    [loadRestaurants, radius]
  );

  const initMap = useCallback(async () => {
    if (mapSessionInitialized && mapSessionUserCoords) {
      if (!mapSessionInitialCoords) {
        mapSessionInitialCoords = mapSessionUserCoords;
      }
      setUserCoords(mapSessionUserCoords);
      setSearchCenter(mapSessionUserCoords);
      setRadius(mapSessionRadius);
      commitAllRestaurants(mapSessionAllRestaurants);
      if (mapSessionRegion) {
        setRegion(mapSessionRegion);
      }
      setIsLocating(false);
      return;
    }

    setIsLocating(true);

    Animated.timing(locationProgress, {
      toValue: 0.9,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    const coords = await getLocation();

    const initialRadius = DEFAULT_SEARCH_RADIUS_METERS;
    mapSessionRadius = initialRadius;
    mapSessionFetchedRadius = initialRadius;
    setRadius(initialRadius);

    if (coords) {
      Animated.timing(locationProgress, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start(() => {
        setIsLocating(false);
      });

      mapSessionUserCoords = coords;
      mapSessionInitialCoords = coords;
      setUserCoords(coords);
      setSearchCenter(coords);

      const initialRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02 * (width / height),
      };
      mapSessionRegion = initialRegion;
      regionRef.current = initialRegion;
      setRegion(initialRegion);

      mapRef.current?.animateToRegion(initialRegion, 1000);

      mapSessionInitialized = true;
      void loadRestaurants(coords.latitude, coords.longitude, initialRadius);
    } else {
      setIsLocating(false);
    }
  }, [commitAllRestaurants, loadRestaurants, locationProgress]);

  useEffect(() => {
    void initMap();
  }, [initMap]);

  const applyMapLocationUpdateRef = useRef(applyMapLocationUpdate);
  applyMapLocationUpdateRef.current = applyMapLocationUpdate;

  useFocusEffect(
    useCallback(() => {
      return subscribeLocationUpdates((coords) => {
        applyMapLocationUpdateRef.current(coords);
      });
    }, [])
  );

  const onRegionChangeComplete = (newRegion: Region) => {
    mapSessionRegion = newRegion;
    regionRef.current = newRegion;
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
        const baseY = selectedRestaurantRef.current
          ? sheetSnapRef.current === 'full'
            ? height * 0.15
            : height * 0.45
          : height;
        const newValue = baseY + gestureState.dy;
        if (newValue > height * 0.1 && newValue < height) {
          sheetAnim.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -50) {
          setSheetSnap('full');
          Animated.spring(sheetAnim, {
            toValue: height * 0.15,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        } else if (gestureState.dy > 100) {
          closeSheet();
        } else {
          setSheetSnap('peek');
          Animated.spring(sheetAnim, {
            toValue: height * 0.45,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const openRestaurantSheet = useCallback((restaurant: any) => {
    if (typeof restaurant?.location?.latitude !== 'number' || typeof restaurant?.location?.longitude !== 'number') {
      return;
    }

    const latDelta = region?.latitudeDelta || 0.015;
    const lngDelta = region?.longitudeDelta || 0.015 * (width / height);

    setSheetSnap('peek');
    selectedRestaurantRef.current = restaurant;
    setSelectedRestaurant(restaurant);
    mapRef.current?.animateToRegion({
      latitude: restaurant.location.latitude - latDelta * 0.25,
      longitude: restaurant.location.longitude,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    }, 400);

    Animated.spring(sheetAnim, {
      toValue: height * 0.45,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [region, sheetAnim]);

  const applyMapFocusRestaurant = useCallback((focus: any, list: any[]) => {
    if (!focus?.id || typeof focus?.location?.latitude !== 'number' || typeof focus?.location?.longitude !== 'number') {
      return;
    }

    const match = list.find((r) => r.id === focus.id);
    const target = match ?? focus;

    if (!mapSessionAllRestaurants.some((r) => r.id === target.id)) {
      commitAllRestaurants([...mapSessionAllRestaurants, target]);
    }

    openRestaurantSheet(target);
  }, [commitAllRestaurants, openRestaurantSheet]);

  const handleMarkerPress = (restaurant: any) => {
    openRestaurantSheet(restaurant);
  };

  useFocusEffect(
    useCallback(() => {
      setRadius(mapSessionRadius);
      const mapFocus = consumeMapFocusRestaurant();
      if (mapFocus) {
        applyMapFocusRestaurant(mapFocus, restaurantsRef.current);
      }
    }, [applyMapFocusRestaurant])
  );

  const closeSheet = () => {
    setSheetSnap('peek');
    Animated.timing(sheetAnim, {
      toValue: height,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setSelectedRestaurant(null));
  };

  const handleRadiusChange = (newRadius: number) => {
    const clamped = Math.min(newRadius, MAX_SEARCH_RADIUS_METERS);
    mapSessionRadius = clamped;
    setRadius(clamped);
    setSliderRadius(clamped);
    setShowSortPicker(false);
    if (Math.abs(clamped - mapSessionFetchedRadius) > 50) {
      const coords = mapSessionUserCoords ?? userCoords;
      if (coords) {
        void loadRestaurants(coords.latitude, coords.longitude, clamped);
      }
    }
  };

  const circleCenter = userCoords ?? searchCenter;

  void openStatusEpoch;
  const sheetPriceLabel = selectedRestaurant ? formatPlacePriceLabel(selectedRestaurant) : '';
  const sheetOpenNow = selectedRestaurant ? isOpenNow(selectedRestaurant) : false;
  const sheetOverallScore =
    selectedRestaurant?.aiOverview != null
      ? calculatePlateboundScore(
          selectedRestaurant.aiOverview,
          selectedRestaurant.rating,
          selectedRestaurant.priceLevel,
          selectedRestaurant.userRatingCount
        )
      : null;
  const sheetScrollMaxHeight = sheetSnap === 'full' ? height * 0.72 : height * 0.34;

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
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
        {...(currentMapStyle ? { customMapStyle: currentMapStyle } : {})}
        loadingEnabled={false}
      >
        {circleCenter ? (
          <Circle
            center={circleCenter}
            radius={radius}
            fillColor="rgba(120,40,200,0.05)"
            strokeColor="rgba(168,85,247,0.45)"
            strokeWidth={1.5}
            zIndex={0}
          />
        ) : null}
        {sortedMarkers.map((item) => {
          const raw = mapSortRawHigherIsGreener(item, mapSortBy);
          const t = mapColorT(raw, markerColorBounds);
          const sortColor = Number.isFinite(raw) ? mapMarkerScoreColor(t) : '#6B7280';
          const displayScore = formatMarkerSortLabel(item, mapSortBy, formatDistance);
          return (
            <RestaurantMapMarker
              key={item.id}
              item={item}
              markerColor={sortColor}
              displayScore={displayScore}
              isOpen={isOpenNow(item)}
              isSelected={selectedRestaurant?.id === item.id}
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
          <Text style={[styles.pageTitle, { color: theme.text, textShadowColor: isDarkTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>{t('map.title')}</Text>
        </View>

        {/* Radius Picker - compact top-left */}
        <View style={styles.radiusArea} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.radiusBtn, { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
            onPress={() => {
              setShowSortPicker(false);
              setShowRadiusPicker(!showRadiusPicker);
            }}
          >
            <Ionicons name="locate" size={14} color={theme.accent} />
            <Text style={[styles.radiusText, { color: theme.text }]}>{formatLabel(sliderRadius)}</Text>
            <Ionicons name={showRadiusPicker ? 'chevron-up' : 'chevron-down'} size={12} color={theme.subtext} />
          </TouchableOpacity>

          {showRadiusPicker && (
            <View style={[styles.pickerContainer, { padding: 16, width: 220, alignItems: 'stretch', backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Text style={{ color: theme.text, textAlign: 'center', marginBottom: 12, fontSize: 16, fontWeight: '700' }}>
                {formatLabel(sliderRadius)}
              </Text>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={1}
                step={0.005}
                value={radiusToSliderValue(sliderRadius)}
                onValueChange={(val) => setSliderRadius(sliderValueToRadius(val))}
                onSlidingComplete={(val) => handleRadiusChange(sliderValueToRadius(val))}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}
                thumbTintColor={theme.accent}
              />
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.sortBtn,
              {
                backgroundColor: theme.cardBackground,
                borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              },
            ]}
            onPress={() => {
              setShowRadiusPicker(false);
              setShowSortPicker(!showSortPicker);
            }}
          >
            <Ionicons name="swap-vertical" size={14} color={theme.accent} />
            <Text style={[styles.radiusText, { color: theme.text }]}>
              {tSortLabel(mapSortBy)}
            </Text>
            <Ionicons name={showSortPicker ? 'chevron-up' : 'chevron-down'} size={12} color={theme.subtext} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.sortBtn,
              {
                backgroundColor: hideClosed ? theme.accent : theme.cardBackground,
                borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              },
            ]}
            onPress={() => {
              const next = !hideClosed;
              setHideClosed(next);
              AsyncStorage.setItem('map_hide_closed', JSON.stringify(next));
            }}
          >
            <Ionicons name="time-outline" size={14} color={hideClosed ? '#FFF' : theme.accent} />
            <Text style={[styles.radiusText, { color: hideClosed ? '#FFF' : theme.text }]}>
              {hideClosed ? t('map.closedHidden', { defaultValue: 'Closed hidden' }) : t('map.hideClosed', { defaultValue: 'Hide closed' })}
            </Text>
          </TouchableOpacity>

          {showSortPicker && (
            <View
              style={[
                styles.sortPickerContainer,
                { backgroundColor: theme.cardBackground, borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <ScrollView
                style={styles.sortPickerScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {SORT_OPTIONS.map(({ key }) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.pickerOption,
                      { borderColor: isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' },
                      mapSortBy === key && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    onPress={() => {
                      setMapSortBy(key);
                      setShowSortPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, { color: theme.text }, mapSortBy === key && { color: '#FFF' }]}>
                      {tSortLabel(key)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
        <View style={[styles.loadingOverlay, { backgroundColor: screenBg }]}>
          <View style={styles.loadingContent}>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>{t('map.acquiringGps')}</Text>
            <Text style={[styles.loadingSubtitle, { color: theme.subtext }]}>{t('map.acquiringGpsSubtitle')}</Text>
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

      {/* Slow Wi-Fi / Fetch Loading Overlay */}
      {isLoading && !isLocating && (
        <View style={[styles.loadingOverlay, { backgroundColor: '#000000' }]}>
          <ActivityIndicator size="large" color={theme.accent} />
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
          <GestureScrollView
            style={[styles.sheetScrollView, { maxHeight: sheetScrollMaxHeight }]}
            contentContainerStyle={[
              styles.sheetContent,
              {
                paddingBottom: Math.max(insets.bottom, 24) + 56,
              },
            ]}
            showsVerticalScrollIndicator={false}
            collapsable={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <View style={{ marginRight: 12 }}>
                <RestaurantCarousel
                  place={selectedRestaurant}
                  width={64}
                  height={64}
                  borderRadius={12}
                  startIndex={0}
                  autoRotate={true}
                  containHorizontal={true}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.restaurantName, { color: theme.text }]}>
                  {selectedRestaurant.displayName?.text}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <Ionicons name={markerIconForPlace(selectedRestaurant)} size={12} color={theme.subtext} />
                  <Text style={[styles.restaurantType, { color: theme.subtext }]}>
                    {selectedRestaurant.primaryType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || t('common.restaurant')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeSheet} style={[styles.closeBtn, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="ribbon-outline" size={14} color="#C9A0FF" />
                <Text style={[styles.metaText, { color: theme.text }]}>
                  {sheetOverallScore != null ? t('map.overallShort', { score: sheetOverallScore.toFixed(1) }) : t('common.missingScore')}
                </Text>
              </View>
              <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={[styles.metaText, { color: theme.text }]}>{selectedRestaurant.rating?.toFixed(1) || t('common.notAvailable')}</Text>
              </View>
              <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                <Ionicons name="navigate-outline" size={14} color="#F9A06F" />
                <Text style={[styles.metaText, { color: theme.text }]}>{t('map.distanceAway', { distance: formatDistance(selectedRestaurant.distanceMeters ?? 0) })}</Text>
              </View>
              {sheetPriceLabel ? (
                <View style={[styles.metaPill, { backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={[styles.metaText, { color: '#F9A06F' }]}>{sheetPriceLabel}</Text>
                </View>
              ) : null}
              <View style={[styles.metaPill, { borderColor: sheetOpenNow ? 'rgba(76,217,100,0.3)' : 'rgba(255,107,107,0.3)', backgroundColor: 'transparent' }]}>
                <Ionicons name={sheetOpenNow ? 'checkmark-circle-outline' : 'close-circle-outline'} size={14} color={sheetOpenNow ? '#4CD964' : '#FF6B6B'} />
                <Text style={[styles.metaText, { color: sheetOpenNow ? '#4CD964' : '#FF6B6B' }]}>{sheetOpenNow ? t('map.openStatus') : t('map.closedStatus')}</Text>
              </View>
            </View>

            <View style={[styles.infoSection, { borderColor: 'rgba(201,160,255,0.15)' }]}>
              <View style={styles.infoSectionHeader}>
                <Ionicons name="sparkles-outline" size={15} color="#C9A0FF" />
                <Text style={[styles.infoSectionTitle, { color: '#C9A0FF' }]}>{t('map.aiOverview')}</Text>
              </View>
              {selectedRestaurant.aiOverview ? (
                <AiOverviewSummaryBody
                  text={selectedRestaurant.aiOverview.summaryGoodBad}
                  style={[styles.infoSectionBody, { color: theme.subtext }]}
                />
              ) : (
                <Text style={[styles.infoSectionBody, { color: theme.subtext }]}>{AI_OVERVIEW_FIELD_PLACEHOLDER}</Text>
              )}
            </View>

            <View style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
              <View style={styles.infoSectionHeader}>
                <Ionicons name="person-outline" size={15} color="#B8E0FF" />
                <Text style={[styles.infoSectionTitle, { color: '#B8E0FF' }]}>{t('map.whoIsItFor')}</Text>
              </View>
              {selectedRestaurant.aiOverview?.whoThisPlaceIsFor ? (
                <TranslatedText text={selectedRestaurant.aiOverview.whoThisPlaceIsFor} style={[styles.infoSectionBody, { color: theme.subtext }]} />
              ) : (
                <Text style={[styles.infoSectionBody, { color: theme.subtext }]}>{AI_OVERVIEW_FIELD_PLACEHOLDER}</Text>
              )}
            </View>

            <MapSheetAiScores
              ai={selectedRestaurant.aiOverview}
              ph={!selectedRestaurant.aiOverview}
              isDark={isDarkTheme}
              theme={{ text: theme.text, subtext: theme.subtext, accent: theme.accent }}
              overallScore={sheetOverallScore}
              overallPh={!selectedRestaurant.aiOverview}
            />

            {selectedRestaurant.websiteUri ? (
              <TouchableOpacity style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]} onPress={() => Linking.openURL(selectedRestaurant.websiteUri)}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="globe-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>{t('result.viewWebsite', { defaultValue: 'Website' })}</Text>
                  <Ionicons name="open-outline" size={12} color={theme.subtext} />
                </View>
                <Text style={[styles.infoSectionBody, { color: '#F9A06F' }]} numberOfLines={1}>{selectedRestaurant.websiteUri}</Text>
              </TouchableOpacity>
            ) : null}

            {selectedRestaurant.nationalPhoneNumber ? (
              <TouchableOpacity style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]} onPress={() => Linking.openURL(`tel:${selectedRestaurant.nationalPhoneNumber}`)}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="call-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>{t('map.phone')}</Text>
                  <Ionicons name="open-outline" size={12} color={theme.subtext} />
                </View>
                <Text style={[styles.infoSectionBody, { color: '#F9A06F' }]}>{selectedRestaurant.nationalPhoneNumber}</Text>
              </TouchableOpacity>
            ) : null}

            {selectedRestaurant.formattedAddress ? (
              <TouchableOpacity
                style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}
                onPress={() => Clipboard.setStringAsync(selectedRestaurant.formattedAddress)}
                activeOpacity={0.7}
              >
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="location-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>{t('map.address')}</Text>
                  <Ionicons name="copy-outline" size={12} color={theme.subtext} />
                </View>
                <Text style={[styles.infoSectionBody, { color: theme.subtext }]}>{selectedRestaurant.formattedAddress}</Text>
              </TouchableOpacity>
            ) : null}

            {(selectedRestaurant.currentOpeningHours?.weekdayDescriptions?.length
              ? selectedRestaurant.currentOpeningHours.weekdayDescriptions
              : selectedRestaurant.regularOpeningHours?.weekdayDescriptions)?.length ? (
              <View style={[styles.infoSection, { borderColor: isDarkTheme ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={styles.infoSectionHeader}>
                  <Ionicons name="time-outline" size={15} color="#F9A06F" />
                  <Text style={[styles.infoSectionTitle, { color: theme.text }]}>{t('map.hours')}</Text>
                </View>
                {(selectedRestaurant.currentOpeningHours?.weekdayDescriptions?.length
                  ? selectedRestaurant.currentOpeningHours.weekdayDescriptions
                  : selectedRestaurant.regularOpeningHours?.weekdayDescriptions
                ).map((line: string, i: number) => {
                  const todayIdx = (new Date().getDay() + 6) % 7;
                  return (
                    <Text key={i} style={[styles.infoSectionBody, { color: i === todayIdx ? '#4CD964' : theme.subtext, fontWeight: i === todayIdx ? '700' : '400' }]}>{formatWeekdayHours(line)}</Text>
                  );
                })}
              </View>
            ) : null}

            <View style={{ height: 40 }} />
          </GestureScrollView>
        )}
      </Animated.View>

      {selectedRestaurant ? (
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.mapsFab,
            {
              backgroundColor: theme.accent,
              bottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          onPress={() => openMaps(
            selectedRestaurant.displayName?.text,
            selectedRestaurant.location.latitude,
            selectedRestaurant.location.longitude
          )}
        >
          <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={14} color="#000" />
          <Text style={styles.mapsFabText}>{t('map.maps')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const darkMapStyle = [
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "elementType": "geometry", "stylers": [{ "color": "#0d0d0d" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#555555" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#0d0d0d" }] },
  { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#444444" }] },
  { "featureType": "administrative.country", "elementType": "labels.text.fill", "stylers": [{ "color": "#777777" }] },
  { "featureType": "administrative.land_parcel", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#999999" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#555555" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#0a0f0a" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#444444" }] },
  { "featureType": "poi.park", "elementType": "labels.text.stroke", "stylers": [{ "color": "#0d0d0d" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#1a1a1a" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#666666" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#222222" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#252525" }] },
  { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#303030" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#444444" }] },
  { "featureType": "transit", "elementType": "labels.text.fill", "stylers": [{ "color": "#555555" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#2a2a2a" }] }
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
  radiusArea: { alignSelf: 'flex-start', marginTop: 4 },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 5, marginTop: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderWidth: 1,
  },
  sortPickerContainer: {
    marginTop: 6, borderRadius: 16, padding: 10, width: 168, maxHeight: 280, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 12, borderWidth: 1,
  },
  sortPickerScroll: { maxHeight: 260 },
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
  },
  sheetHandleContainer: { alignItems: 'center', paddingVertical: 15 },
  sheetHandle: { width: 60, height: 6, borderRadius: 3 },
  sheetScrollView: { flex: 1 },
  sheetContent: { paddingHorizontal: 24 },
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
  mapsFab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    gap: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    zIndex: 10001,
  },
  mapsFabText: { color: '#000', fontSize: 13, fontWeight: '800' },
  infoSection: {
    marginBottom: 10, backgroundColor: 'rgba(30,15,30,0.45)',
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  infoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  infoSectionTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  infoSectionBody: { fontSize: 13, lineHeight: 19 },
  aiOverallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  aiOverallLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  aiOverallLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
  aiOverallVal: { fontSize: 18, fontWeight: '900' },
  macrosBlock: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  aiStripRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingVertical: 4,
    paddingRight: 8,
  },
  aiSquare: {
    width: 78,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'flex-start',
  },
  aiSquareEmoji: { fontSize: 18, textAlign: 'center', marginBottom: 4 },
  aiSquareLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
  aiSquareVal: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  aiBarCard: {
    width: 200,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  aiBarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  aiBarTitle: { fontSize: 12, fontWeight: '700', flex: 1 },
  aiBarNum: { fontSize: 12, fontWeight: '700' },
  aiBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  aiBarFill: { height: '100%', borderRadius: 4 },
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
