import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { NeonBorderCard } from '@/components/NeonBorderCard';
import { NeonGradientTitle } from '@/components/NeonGradientTitle';
import { ScenarioQuickBar } from '@/components/ScenarioQuickBar';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { getLocation } from '@/core/locationCache';
import type { AiOverview } from '@/core/aiOverviewCache';
import { fetchIsLikelyRainNow } from '@/core/openMeteoWeather';
import { scoreRestaurantPool } from '@/core/recommendationEngine';
import { getRecommendationPrefs, getRecommendationPrefsRevision } from '@/core/recommendationPrefs';
import {
  inferMealTypeFromClock,
  type RecommendationPrefsV1,
  type ScoredRestaurant,
  DEFAULT_SESSION_BUDGET,
  DEFAULT_SESSION_GROUP,
  type SessionOverrides,
} from '@/core/recommendationTypes';
import { useFocusEffect } from '@react-navigation/native';
import { DEFAULT_SEARCH_RADIUS_METERS } from '@/core/searchRadiusOptions';
import { getCachedResults, setCachedResults } from '@/core/resultCache';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '@/core/images';
import {
  consumeHomeReturnFromDetails,
  getHomeCarouselIndex,
  markHomeOpeningDetails,
  setHomeCarouselIndex,
} from '@/core/homeSpotlightState';
import { pickFunHomeTitle, onHomeTitleReroll } from '@/core/homeTitle';
import { formatRestaurantCostLabel } from '@/core/placePriceLabel';
import { appendVisit } from '@/core/recommendationVisitHistory';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlatList, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Line as SvgLine,
  LinearGradient as SvgLinearGradient,
  Pattern,
  Polygon,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { hapticMedium, hapticSuccess } from '@/core/haptics';
import { playSuccess } from '@/core/audioService';

const WINDOW_WIDTH = Dimensions.get('window').width;
const WINDOW_HEIGHT = Dimensions.get('window').height;
const SPOTLIGHT_RADAR_HEIGHT = Math.round(
  Math.min(WINDOW_HEIGHT * 0.52, WINDOW_WIDTH * 0.94, 540)
);
const SPOTLIGHT_RADAR_CARD_HEIGHT =
  Math.round(Math.min(WINDOW_WIDTH * 0.62, WINDOW_HEIGHT * 0.32, 290)) - 3;
const SPOTLIGHT_THUMB_SIZE = 72;
const SPOTLIGHT_CARD_INSET = 18;

function formatReviewCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
const CAROUSEL_PAGE = WINDOW_WIDTH;
const SPOTLIGHT_RESULTS_CACHE_PREFIX = 'map_results';
const FILM_STRIP_FRAC = 0.66;
const FILM_GAP = 2;
const FILM_STRIP_WIDTH = WINDOW_WIDTH * FILM_STRIP_FRAC;
const FILM_CARD_W = (FILM_STRIP_WIDTH - 9 * FILM_GAP) / 10;
const FILM_CARD_H = FILM_CARD_W * 1.55;

const FILMSTRIP_ICONS: React.ComponentProps<typeof Ionicons>['name'][] = [
  'restaurant-outline',
  'fast-food-outline',
  'wine-outline',
  'cafe-outline',
  'pizza-outline',
  'ice-cream-outline',
  'nutrition-outline',
  'fish-outline',
];

function stripIconForPlaceId(id: string): React.ComponentProps<typeof Ionicons>['name'] {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return FILMSTRIP_ICONS[Math.abs(h) % FILMSTRIP_ICONS.length] ?? 'restaurant-outline';
}

const FILMSTRIP_PALETTE: { bg: string; border: string; mark: string }[] = [
  { bg: 'rgba(249,115,82,0.62)', border: '#FFD4CC', mark: '#3F0D00' },
  { bg: 'rgba(250,204,21,0.55)', border: '#FFF7C2', mark: '#3A2800' },
  { bg: 'rgba(74,222,128,0.52)', border: '#DCFCE7', mark: '#0F2918' },
  { bg: 'rgba(56,189,248,0.55)', border: '#CFFAFE', mark: '#082F49' },
  { bg: 'rgba(167,139,250,0.58)', border: '#EDE9FE', mark: '#2E1065' },
  { bg: 'rgba(244,114,182,0.55)', border: '#FCE7F3', mark: '#4A051E' },
  { bg: 'rgba(45,212,191,0.52)', border: '#CCFBF1', mark: '#042F2E' },
  { bg: 'rgba(251,146,60,0.58)', border: '#FFEDD5', mark: '#431407' },
  { bg: 'rgba(129,140,248,0.55)', border: '#E0E7FF', mark: '#1E1B4B' },
  { bg: 'rgba(250,112,154,0.55)', border: '#FFE4E9', mark: '#4A0D24' },
];

const NEON_CYAN = '#00FFFF';
const NEON_MAGENTA = '#FF00FF';
const SCORE_GOOD_COLOR = '#4CD964';
const SCORE_MID_COLOR = '#FF9500';
const SCORE_BAD_COLOR = '#FF4444';

function absoluteScoreColor(score: number | null, max: 5 | 10, fallback: string): string {
  if (score == null) return fallback;
  const norm10 = (clampScore(score, max) / max) * 10;
  if (norm10 >= 7) return SCORE_GOOD_COLOR;
  if (norm10 >= 4.5) return SCORE_MID_COLOR;
  return SCORE_BAD_COLOR;
}

const FILMSTRIP_PALETTE_NEON: { bg: string; mark: string }[] = [
  { bg: 'rgba(0,35,48,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(40,0,48,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(0,28,32,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(32,0,40,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(0,24,36,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(36,0,28,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(0,32,40,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(28,0,36,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(0,30,44,0.92)', mark: '#FFFFFF' },
  { bg: 'rgba(44,0,32,0.92)', mark: '#FFFFFF' },
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

function clampScore(v: number, max: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, v));
}

function polygonRing(cx: number, cy: number, radius: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return `${cx + radius * Math.cos(t)},${cy + radius * Math.sin(t)}`;
  }).join(' ');
}

function scoreAxis(ai: AiOverview | null | undefined, key: keyof AiOverview): number | null {
  if (!ai) return null;
  const v = ai[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatAxisReading(max: 5 | 10, s: number | null): string {
  if (s == null) return '—';
  if (max === 10) return `${clampScore(s, max).toFixed(1)}/${max}`;
  return `${Math.round(clampScore(s, max))}/${max}`;
}

function RestaurantScorePentagon({
  ai,
  stroke,
  gridColor = 'rgba(255,255,255,0.10)',
  labelColor = 'rgba(255,255,255,0.62)',
  svgHeight = SPOTLIGHT_RADAR_HEIGHT,
  neon,
  variant = 'solid',
  gradientColors,
}: {
  ai: AiOverview | null | undefined;
  stroke: string;
  gridColor?: string;
  labelColor?: string;
  svgHeight?: number;
  neon?: boolean;
  variant?: 'solid' | 'gradient' | 'sketch';
  gradientColors?: [string, string];
}) {
  const gid = useId().replace(/:/g, '');
  const n = 5;
  const { t: radarT } = useTranslation();
  const axes: { key: keyof AiOverview; corner: string; max: 5 | 10 }[] = [
    { key: 'healthScore', corner: radarT('home.radarHealth'), max: 10 },
    { key: 'tasteScore', corner: radarT('home.radarTaste'), max: 5 },
    { key: 'valueForMoneyScore', corner: radarT('home.radarValue'), max: 5 },
    { key: 'dateWorthiness', corner: radarT('home.radarDate'), max: 5 },
    { key: 'speedScore', corner: radarT('home.radarSpeed'), max: 5 },
  ];
  const norms = axes.map(({ key, max }) => {
    const s = scoreAxis(ai, key);
    if (s == null) return 0;
    return clampScore(s, max) / max;
  });
  const cx = 50;
  const cy = 50;
  const R = 40;
  const labelR = 47;
  const fillPts = norms
    .map((norm, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = norm * R;
      return `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`;
    })
    .join(' ');

  const useGradient = neon || variant === 'gradient';
  const useSketch = !neon && variant === 'sketch';

  const ringStroke = neon ? NEON_CYAN : stroke;
  const ringGrid = useSketch
    ? 'rgba(0,0,0,0.08)'
    : neon
    ? 'rgba(0,255,255,0.2)'
    : gridColor;
  const ringLabel = useSketch
    ? labelColor
    : neon
    ? 'rgba(255,255,255,0.92)'
    : labelColor;
  const gridSW = useSketch ? 0.3 : neon ? 0.5 : 0.35;
  const outerGridSW = useSketch ? 0.35 : neon ? 0.55 : 0.45;
  const polygonSW = useSketch ? 1.5 : neon ? 1.45 : 1.25;
  const cornerFontSize = 6.4;
  const scoreFontSize = 6.0;

  const gradFrom = neon ? NEON_CYAN : gradientColors?.[0] ?? stroke;
  const gradTo = neon ? NEON_MAGENTA : gradientColors?.[1] ?? stroke;
  const fillValue = useGradient
    ? `url(#pf-${gid})`
    : useSketch
    ? 'transparent'
    : `${stroke}55`;

  if (useSketch) {
    return (
      <View style={styles.radarBlock}>
        <Svg width="100%" height={svgHeight} viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet">
          <Defs>
            <Filter id={`wcf-${gid}`} x="-25%" y="-25%" width="150%" height="150%" filterUnits="objectBoundingBox">
              <FeGaussianBlur stdDeviation={3.2} />
            </Filter>
            <Pattern
              id={`bsp-${gid}`}
              x="0"
              y="0"
              width="13"
              height="13"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-32 50 50)"
            >
              <SvgLine x1="-4" y1="0" x2="17" y2="0" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeOpacity="0.07" />
              <SvgLine x1="-4" y1="6.5" x2="17" y2="6.5" stroke={stroke} strokeWidth="4.5" strokeLinecap="round" strokeOpacity="0.05" />
              <SvgLine x1="-4" y1="13" x2="17" y2="13" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.06" />
            </Pattern>
            <Pattern
              id={`bsp2-${gid}`}
              x="0"
              y="0"
              width="11"
              height="11"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(55 50 50)"
            >
              <SvgLine x1="-4" y1="0" x2="15" y2="0" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.04" />
              <SvgLine x1="-4" y1="5.5" x2="15" y2="5.5" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.03" />
            </Pattern>
          </Defs>

          {/* Pencil-drawn grid rings */}
          <Polygon
            points={polygonRing(cx, cy, R * 0.34, n)}
            fill="none"
            stroke={ringGrid}
            strokeWidth={0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 0.7 2.5 0.6 3.5 0.7 1.8 0.5"
          />
          <Polygon
            points={polygonRing(cx, cy, R * 0.67, n)}
            fill="none"
            stroke={ringGrid}
            strokeWidth={0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 0.8 3 0.6 4 0.7 2 0.6"
          />
          <Polygon
            points={polygonRing(cx, cy, R, n)}
            fill="none"
            stroke={ringGrid}
            strokeWidth={0.35}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5.5 0.8 3.5 0.7 4.5 0.8 2.5 0.6"
          />

          {/* Watercolor fill — blurred base wash for soft bleeding edges */}
          <Polygon
            points={fillPts}
            fill={stroke}
            fillOpacity={0.18}
            filter={`url(#wcf-${gid})`}
          />
          {/* Flat base wash */}
          <Polygon points={fillPts} fill={stroke} fillOpacity={0.1} />
          {/* Cross-hatch brush stroke texture — two directions */}
          <Polygon points={fillPts} fill={`url(#bsp-${gid})`} />
          <Polygon points={fillPts} fill={`url(#bsp2-${gid})`} />

          {/* Brush stroke outline — wide halo layer */}
          <Polygon
            points={fillPts}
            fill="none"
            stroke={stroke}
            strokeWidth={5.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity={0.12}
          />
          {/* Brush stroke outline — medium body with irregular dashes */}
          <Polygon
            points={fillPts}
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity={0.45}
            strokeDasharray="7.5 0.8 4.5 0.6 6.5 0.8 3 0.5 5 0.7"
          />
          {/* Brush stroke outline — thin bristle edge */}
          <Polygon
            points={fillPts}
            fill="none"
            stroke={stroke}
            strokeWidth={0.9}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity={0.72}
            strokeDasharray="5.5 1.2 3.5 0.9 4.5 1 2.5 0.8 4 1.1"
          />

          {axes.map(({ key, corner, max }, i) => {
            const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
            const lx = cx + labelR * Math.cos(t);
            const ly = cy + labelR * Math.sin(t);
            const s = scoreAxis(ai, key);
            const reading = formatAxisReading(max, s);
            const cornerFill = ringLabel;
            const scoreFill = absoluteScoreColor(s, max, ringLabel);
            return (
              <G key={corner}>
                <SvgText
                  x={lx}
                  y={ly - 2.4}
                  fill={cornerFill}
                  fontSize={cornerFontSize}
                  fontWeight="700"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {corner}
                </SvgText>
                <SvgText
                  x={lx}
                  y={ly + 3.6}
                  fill={scoreFill}
                  fontSize={scoreFontSize}
                  fontWeight="700"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {reading}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.radarBlock}>
      <Svg width="100%" height={svgHeight} viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet">
        <Defs>
          {useGradient && (
            <SvgLinearGradient id={`pf-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradFrom} stopOpacity={0.58} />
              <Stop offset="0.5" stopColor={neon ? '#9400FF' : gradFrom} stopOpacity={0.42} />
              <Stop offset="1" stopColor={gradTo} stopOpacity={0.52} />
            </SvgLinearGradient>
          )}
        </Defs>
        <Polygon points={polygonRing(cx, cy, R * 0.34, n)} fill="rgba(128,128,128,0.04)" stroke={ringGrid} strokeWidth={gridSW} />
        <Polygon points={polygonRing(cx, cy, R * 0.67, n)} fill="rgba(128,128,128,0.04)" stroke={ringGrid} strokeWidth={gridSW} />
        <Polygon points={polygonRing(cx, cy, R, n)} fill="rgba(128,128,128,0.05)" stroke={ringGrid} strokeWidth={outerGridSW} />
        <Polygon points={fillPts} fill={fillValue} stroke={ringStroke} strokeWidth={polygonSW} strokeLinejoin="round" />
        {axes.map(({ key, corner, max }, i) => {
          const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const lx = cx + labelR * Math.cos(t);
          const ly = cy + labelR * Math.sin(t);
          const s = scoreAxis(ai, key);
          const reading = formatAxisReading(max, s);
          const cornerFill = ringLabel;
          const scoreFill = absoluteScoreColor(s, max, ringLabel);
          return (
            <G key={corner}>
              <SvgText
                x={lx}
                y={ly - 2.4}
                fill={cornerFill}
                fontSize={cornerFontSize}
                fontWeight="700"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {corner}
              </SvgText>
              <SvgText
                x={lx}
                y={ly + 3.6}
                fill={scoreFill}
                fontSize={scoreFontSize}
                fontWeight="700"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {reading}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function SpotlightCard({
  scored,
  canReject,
  onReject,
  onPress,
}: {
  scored: ScoredRestaurant;
  canReject: boolean;
  onReject: () => void;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const place = scored.place;
  const name = place.displayName?.text || t('common.unknown');
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance, formatWalkingTime } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;
  const reviews = place.userRatingCount;
  const costLabel = formatRestaurantCostLabel(place);
  const [photos, setPhotos] = useState<any[]>(place.photos || []);

  useEffect(() => {
    let cancelled = false;
    const loadPhotos = async () => {
      if (!place?.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return;
      const urls = await fetchRestaurantPhotoUrls({
        placeId: place.id,
        name,
        latitude: lat,
        longitude: lng,
        websiteUrl: place.websiteUri || undefined,
        formattedAddress: place.formattedAddress || undefined,
        cuisineKey: place.primaryType?.replace(/_restaurant$/, '') || undefined,
      });
      if (cancelled) return;
      setPhotos(urls.length > 0 ? urls : (place.photos || []));
    };
    loadPhotos();
    return () => { cancelled = true; };
  }, [place?.id, name, lat, lng]);

  const ai = place.aiOverview as AiOverview | null | undefined;
  const neonUi = Boolean(theme.neonColors);
  const radarVar = theme.radarVariant ?? 'solid';

  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const panStartY = useSharedValue(0);

  const rejectRef = useRef(onReject);
  rejectRef.current = onReject;
  const fireReject = useCallback(() => {
    rejectRef.current();
  }, []);

  const placeId = String(place?.id ?? '');
  useEffect(() => {
    ty.value = 0;
    opacity.value = 1;
  }, [placeId, ty, opacity]);

  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const firePress = useCallback(() => {
    pressRef.current();
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(false)
        .activeOffsetY(10)
        .failOffsetX([-24, 24])
        .onStart(() => {
          panStartY.value = ty.value;
        })
        .onUpdate(e => {
          const next = panStartY.value + e.translationY;
          const clamped = next > 0 ? next : 0;
          ty.value = clamped;
          opacity.value = Math.max(0.38, 1 - clamped / 420);
        })
        .onEnd(e => {
          const dismiss = ty.value > 96 || e.velocityY > 620;
          if (dismiss) {
            const target = WINDOW_HEIGHT * 0.55;
            ty.value = withTiming(target, { duration: 280 }, finished => {
              if (finished) runOnJS(fireReject)();
            });
            opacity.value = withTiming(0, { duration: 260 });
          } else {
            ty.value = withSpring(0, { damping: 20, stiffness: 260 });
            opacity.value = withSpring(1, { damping: 20, stiffness: 260 });
          }
        }),
    [canReject, fireReject, opacity, panStartY, ty]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(14)
        .maxDuration(280)
        .onBegin(() => {
          pressScale.value = withTiming(0.98, { duration: 80 });
        })
        .onFinalize((_e, success) => {
          pressScale.value = withSpring(1, { damping: 20, stiffness: 300 });
          if (success) runOnJS(firePress)();
        }),
    [firePress, pressScale]
  );

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { scale: pressScale.value }],
    opacity: opacity.value,
  }));

  const cardBody = (
    <>
      <View style={styles.spotlightThumbPinned}>
        <RestaurantImage
          restaurantId={String(place?.id ?? '')}
          photos={photos}
          width={SPOTLIGHT_THUMB_SIZE}
          height={SPOTLIGHT_THUMB_SIZE}
          quality={200}
          loadDelay={300}
          borderRadius={14}
        />
      </View>
      <View style={styles.spotlightHeroText}>
        <Text style={[styles.spotlightTitle, { color: theme.text }]} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.spotlightMetaRow}>
          <View
            style={[
              styles.spotlightMetaPill,
              neonUi
                ? styles.spotlightMetaPillNeon
                : { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' },
            ]}
          >
            <Ionicons name="navigate-outline" size={11} color={neonUi ? NEON_CYAN : theme.accent} />
            <Text
              style={[
                styles.spotlightMetaText,
                { color: neonUi ? 'rgba(255,255,255,0.92)' : theme.subtext },
              ]}
            >
              {formatDistance(Math.round(place.distanceMeters ?? 0))}
            </Text>
          </View>
          <View
            style={[
              styles.spotlightMetaPill,
              neonUi
                ? styles.spotlightMetaPillNeon
                : { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' },
            ]}
          >
            <Ionicons name="walk-outline" size={11} color={neonUi ? NEON_CYAN : theme.accent} />
            <Text
              style={[
                styles.spotlightMetaText,
                { color: neonUi ? 'rgba(255,255,255,0.92)' : theme.subtext },
              ]}
            >
              {formatWalkingTime(Math.round(place.distanceMeters ?? 0))}
            </Text>
          </View>
          {rating ? (
            <View
              style={[
                styles.spotlightMetaPill,
                neonUi
                  ? styles.spotlightMetaPillNeon
                  : { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' },
              ]}
            >
              <Ionicons name="star" size={11} color="#FBBF24" />
              <Text style={[styles.spotlightMetaText, styles.spotlightMetaRating]}>
                {rating}
                {reviews ? ` (${formatReviewCount(reviews)})` : ''}
              </Text>
            </View>
          ) : null}
          {costLabel ? (
            <View
              style={[
                styles.spotlightMetaPill,
                neonUi
                  ? styles.spotlightMetaPillNeon
                  : { backgroundColor: 'rgba(249,160,111,0.14)', borderColor: 'rgba(249,160,111,0.28)' },
              ]}
            >
              <Ionicons name="cash-outline" size={11} color={neonUi ? NEON_MAGENTA : '#F9A06F'} />
              <Text
                style={[
                  styles.spotlightMetaText,
                  styles.spotlightMetaPrice,
                  { color: neonUi ? NEON_MAGENTA : '#F9A06F' },
                ]}
              >
                {costLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.scorePentagonCol}>
        <RestaurantScorePentagon
          ai={ai}
          stroke={theme.accent}
          gridColor={theme.radarGridColor}
          labelColor={theme.subtext}
          svgHeight={SPOTLIGHT_RADAR_CARD_HEIGHT}
          neon={neonUi}
          variant={radarVar}
          gradientColors={neonUi ? undefined : theme.matchOrbColors}
        />
      </View>
    </>
  );

  const cardInner = (
    <Animated.View style={[styles.spotlightCardOuter, cardAnim]}>
      <NeonBorderCard borderRadius={26}>
        <View style={styles.spotlightPressLayer}>
          <GestureDetector gesture={Gesture.Exclusive(panGesture, tapGesture)}>
            <View>{cardBody}</View>
          </GestureDetector>
          <TouchableOpacity
            style={[
              styles.spotlightMapsBtn,
              neonUi
                ? { backgroundColor: 'rgba(0,255,255,0.14)', borderColor: NEON_CYAN }
                : { backgroundColor: theme.accent, borderColor: theme.accent },
              !mapsReady && styles.spotlightMapsBtnDisabled,
            ]}
            onPress={() => { if (!mapsReady) return; hapticSuccess(); playSuccess(); openMaps(name, lat, lng); }}
            disabled={!mapsReady}
            activeOpacity={0.85}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
              size={22}
              color={neonUi ? NEON_CYAN : '#FFFFFF'}
            />
            <Text
              style={[
                styles.spotlightMapsBtnText,
                { color: neonUi ? NEON_CYAN : '#FFFFFF' },
              ]}
              numberOfLines={1}
            >
              {Platform.OS === 'ios' ? t('common.openInAppleMaps') : t('common.openInGoogleMaps')}
            </Text>
          </TouchableOpacity>
        </View>
      </NeonBorderCard>
    </Animated.View>
  );

  return cardInner;
}

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const sessionRadiusRef = useRef(DEFAULT_SEARCH_RADIUS_METERS);
  const hasFocusedOnceRef = useRef(false);
  const skipNextFocusReloadRef = useRef(false);
  const lastPrefsRevisionRef = useRef<number | null>(null);
  const carouselRef = useRef<FlatList<ScoredRestaurant>>(null);

  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);
  const [session, setSession] = useState<SessionOverrides | null>(null);
  const [rawPlaces, setRawPlaces] = useState<any[]>([]);
  const [ranked, setRanked] = useState<ScoredRestaurant[]>([]);
  const [pickIndex, setPickIndex] = useState(() => getHomeCarouselIndex());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(() => new Set());
  const visibleLenRef = useRef(-1);
  const pickIndexRef = useRef(0);
  pickIndexRef.current = pickIndex;

  const restoreCarouselPosition = useCallback((index: number) => {
    const idx = Math.max(0, index);
    setPickIndex(idx);
    pickIndexRef.current = idx;
    setHomeCarouselIndex(idx);
    requestAnimationFrame(() => {
      carouselRef.current?.scrollToOffset({ offset: idx * CAROUSEL_PAGE, animated: false });
    });
  }, []);

  useEffect(() => {
    setHomeCarouselIndex(pickIndex);
  }, [pickIndex]);

  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'health');

  const visibleList = useMemo(() => {
    return ranked.slice(0, 5).filter(r => !rejectedIds.has(String(r.place?.id ?? '')));
  }, [ranked, rejectedIds]);

  const rejectPickAt = useCallback(
    (placeId: string) => {
      setRejectedIds(prev => {
        const curList = ranked.slice(0, 5).filter(r => !prev.has(String(r.place?.id ?? '')));
        if (curList.length <= 1) return prev;
        const idx = curList.findIndex(r => String(r.place?.id ?? '') === placeId);
        if (idx < 0) return prev;
        const p = pickIndexRef.current;
        if (idx < p) setPickIndex(p - 1);
        else if (idx > p) setPickIndex(p);
        else setPickIndex(Math.min(p, curList.length - 2));
        return new Set(prev).add(placeId);
      });
    },
    [ranked]
  );

  useEffect(() => {
    void getRecommendationPrefs().then(p => {
      setPrefs(p);
      lastPrefsRevisionRef.current = getRecommendationPrefsRevision();
      setSession({
        mealType: inferMealTypeFromClock(),
        groupSize: DEFAULT_SESSION_GROUP,
        budgetCeiling: DEFAULT_SESSION_BUDGET,
        radiusMeters: DEFAULT_SEARCH_RADIUS_METERS,
        sessionMood: null,
      });
    });
  }, []);

  useEffect(() => {
    if (session != null) sessionRadiusRef.current = session.radiusMeters;
  }, [session]);

  const recompute = useCallback(async () => {
    const coords = coordsRef.current;
    if (!prefs || !session || !coords || rawPlaces.length === 0) return;
    const rainy = await fetchIsLikelyRainNow(coords.latitude, coords.longitude);
    const scored = scoreRestaurantPool(rawPlaces, {
      prefs,
      session,
      userLat: coords.latitude,
      userLng: coords.longitude,
      rainyWeather: rainy === true ? true : undefined,
    });
    setRanked(scored);
    setRejectedIds(new Set());
    const nextVisibleLen = Math.max(0, scored.slice(0, 5).length - 1);
    const nextPick = Math.min(pickIndexRef.current, nextVisibleLen);
    setPickIndex(nextPick);
    carouselRef.current?.scrollToOffset({ offset: nextPick * CAROUSEL_PAGE, animated: false });
  }, [prefs, session, rawPlaces]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  useEffect(() => {
    setPickIndex(i => Math.min(i, Math.max(0, visibleList.length - 1)));
  }, [visibleList.length]);

  useLayoutEffect(() => {
    if (visibleList.length !== visibleLenRef.current) {
      visibleLenRef.current = visibleList.length;
      const i = Math.min(Math.max(0, pickIndex), Math.max(0, visibleList.length - 1));
      carouselRef.current?.scrollToOffset({ offset: i * CAROUSEL_PAGE, animated: false });
    }
  }, [visibleList.length, pickIndex]);

  const loadSpotlight = useCallback(async (opts?: { skipFullScreenLoader?: boolean }) => {
    const skipLoader = opts?.skipFullScreenLoader === true;
    if (!skipLoader) {
      setIsLoading(true);
    }
    setErrorMsg(null);
    startGpsPhase();
    let hadCachedPlaces = false;
    try {
      const coords = await getLocation(false);
      if (!coords) {
        setErrorMsg(t('home.locationError'));
        setRawPlaces([]);
        return;
      }
      coordsRef.current = coords;
      const rad = DEFAULT_SEARCH_RADIUS_METERS;
      const cacheKey = `${SPOTLIGHT_RESULTS_CACHE_PREFIX}_${Math.round(rad)}`;
      const cached = await getCachedResults(cacheKey);
      if (cached && cached.length > 0) {
        hadCachedPlaces = true;
        setRawPlaces(cached);
        if (!skipLoader) {
          setIsLoading(false);
        }
        snapProgressComplete();
      }
      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        rad,
        hadCachedPlaces ? undefined : onOrchestratorProgress,
        {
          onAiReady: enriched => {
            void setCachedResults(cacheKey, enriched);
            setRawPlaces(enriched);
          },
        }
      );
      await setCachedResults(cacheKey, all);
      setRawPlaces(all);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      if (!hadCachedPlaces) {
        setErrorMsg(t('home.loadError'));
        setRawPlaces([]);
      }
    } finally {
      snapProgressComplete();
      if (!skipLoader) {
        setIsLoading(false);
      }
    }
  }, [onOrchestratorProgress, prefs, snapProgressComplete, startFetchPhase, startGpsPhase, t]);

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlight();
    }
  }, [loadSpotlight, prefs, session]);

  useFocusEffect(
    useCallback(() => {
      const returningFromDetails =
        skipNextFocusReloadRef.current || consumeHomeReturnFromDetails();
      if (returningFromDetails) {
        skipNextFocusReloadRef.current = false;
        restoreCarouselPosition(getHomeCarouselIndex());
        return;
      }
      if (sessionRadiusRef.current !== DEFAULT_SEARCH_RADIUS_METERS) {
        sessionRadiusRef.current = DEFAULT_SEARCH_RADIUS_METERS;
        setSession(s => (s ? { ...s, radiusMeters: DEFAULT_SEARCH_RADIUS_METERS } : s));
      }
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      const currentRevision = getRecommendationPrefsRevision();
      if (lastPrefsRevisionRef.current === currentRevision) {
        return;
      }
      lastPrefsRevisionRef.current = currentRevision;
      void getRecommendationPrefs().then(nextPrefs => {
        setPrefs(nextPrefs);
        void loadSpotlight();
      });
    }, [loadSpotlight, restoreCarouselPosition])
  );

  const goToPick = useCallback((i: number) => {
    const max = Math.max(0, visibleList.length - 1);
    const next = Math.min(Math.max(0, i), max);
    setPickIndex(next);
    carouselRef.current?.scrollToOffset({ offset: next * CAROUSEL_PAGE, animated: true });
  }, [visibleList.length]);

  const onCarouselMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / CAROUSEL_PAGE);
      const max = Math.max(0, visibleList.length - 1);
      setPickIndex(Math.min(Math.max(0, i), max));
    },
    [visibleList.length]
  );

  const openDetails = async (item: ScoredRestaurant) => {
    skipNextFocusReloadRef.current = true;
    markHomeOpeningDetails(pickIndexRef.current);
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    setCurrentRestaurant(item.place);
    router.push('/random-result');
  };

  const noPlacesAtAll = !isLoading && !errorMsg && ranked.length === 0;
  const homeBottomPad = tabBarHeight + 12;
  const rootNeon = Boolean(theme.neonColors);
  const [funTitle, setFunTitle] = useState(pickFunHomeTitle);

  useEffect(() => onHomeTitleReroll(() => setFunTitle(pickFunHomeTitle())), []);

  const homeBody = (
    <>
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.homeContent, { paddingBottom: homeBottomPad }]}>
          <View style={styles.homeTitleWrap}>
            {rootNeon ? (
              <NeonGradientTitle
                text={funTitle}
                width={WINDOW_WIDTH - 32}
                style={styles.homeNeonTitle}
              />
            ) : (
              <Text style={[styles.pageTitle, { color: theme.pageTitleColor }]}>{funTitle}</Text>
            )}
          </View>

          <ScenarioQuickBar />

          {isLoading ? (
            <RestaurantLoadingProgressBar
              stageLabel={loadingStage}
              progress={loadingProgress}
              style={styles.loadingBox}
            />
          ) : errorMsg ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { hapticMedium(); void loadSpotlight(); }}>
                <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
              </TouchableOpacity>
            </View>
          ) : noPlacesAtAll ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{t('home.noResults')}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { hapticMedium(); void loadSpotlight(); }}>
                <Text style={styles.retryText}>{t('common.refresh')}</Text>
              </TouchableOpacity>
            </View>
          ) : visibleList.length > 0 ? (
            <View style={styles.galleryBlock}>
              <FlatList
                ref={carouselRef}
                data={visibleList}
                keyExtractor={item => String(item.place?.id ?? '')}
                horizontal
                pagingEnabled
                bounces={false}
                alwaysBounceVertical={false}
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onCarouselMomentumEnd}
                getItemLayout={(_, index) => ({
                  length: CAROUSEL_PAGE,
                  offset: CAROUSEL_PAGE * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <View style={styles.carouselPage}>
                    <SpotlightCard
                      scored={item}
                      canReject={visibleList.length > 1}
                      onReject={() => rejectPickAt(String(item.place?.id ?? ''))}
                      onPress={() => void openDetails(item)}
                    />
                  </View>
                )}
              />
              <View style={styles.dotsBar}>
                {visibleList.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => goToPick(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <View
                      style={[
                        styles.dot,
                        i === pickIndex && styles.dotActive,
                        { backgroundColor: i === pickIndex ? theme.accent : 'rgba(255,255,255,0.3)' },
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </>
  );

  return rootNeon ? (
    <View style={[styles.background, { backgroundColor: '#000000' }]}>{homeBody}</View>
  ) : (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      {homeBody}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, paddingTop: 24 },
  homeContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  homeTitleWrap: {
    marginTop: 20,
    marginBottom: 2,
  },
  homeNeonTitle: {
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 0,
  },
  galleryBlock: { marginHorizontal: -20, flexGrow: 0, marginTop: 16, marginBottom: 5 },
  carouselPage: {
    width: CAROUSEL_PAGE,
    paddingHorizontal: 10,
  },
  cardSwipeTooltip: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
    lineHeight: 16,
  },
  filmstripBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
  },
  filmstripRefreshBtn: {
    paddingVertical: 4,
    paddingRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmstripWrap: { alignSelf: 'center' },
  filmstripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  filmstripThumb: {
    borderRadius: 8,
    overflow: 'visible',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmstripThumbActive: {
    borderWidth: 2.5,
    shadowColor: '#F9A06F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 5,
    elevation: 5,
  },
  filmstripThumbNeonOuter: {
    borderRadius: 10,
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filmstripThumbNeonGrad: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    padding: 2.5,
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
  },
  filmstripThumbNeonInner: {
    flex: 1,
    borderRadius: 7.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: { marginTop: 12 },
  messageBox: {
    marginTop: 16,
    backgroundColor: 'rgba(30,15,30,0.55)',
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  messageText: { fontSize: 15, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  retryBtn: {
    alignSelf: 'center',
    backgroundColor: '#F97352',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  spotlightCardOuter: {
    alignSelf: 'center',
    width: '100%',
    overflow: 'visible',
  },
  spotlightPressLayer: {
    position: 'relative',
    padding: SPOTLIGHT_CARD_INSET,
    gap: 12,
  },
  spotlightThumbPinned: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SPOTLIGHT_THUMB_SIZE,
    height: SPOTLIGHT_THUMB_SIZE,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 2,
  },
  spotlightHeroText: {
    marginLeft: SPOTLIGHT_THUMB_SIZE + 12,
    minHeight: SPOTLIGHT_THUMB_SIZE,
    gap: 6,
  },
  spotlightTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
  },
  spotlightMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  spotlightMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
  },
  spotlightMetaPillNeon: {
    backgroundColor: 'rgba(0,255,255,0.1)',
    borderColor: 'rgba(0,255,255,0.22)',
  },
  spotlightMetaText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  spotlightMetaRating: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  spotlightMetaPrice: {
    fontWeight: '700',
  },
  scorePentagonCol: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    marginTop: 8,
  },
  radarBlock: { width: '100%', marginTop: 0, overflow: 'visible' },
  spotlightMapsBtn: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  spotlightMapsBtnDisabled: { opacity: 0.45 },
  spotlightMapsBtnText: { fontSize: 17, fontWeight: '800' },
  dotsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingTop: 6,
    paddingBottom: 0,
    marginTop: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 9, height: 9, borderRadius: 4.5 },
});