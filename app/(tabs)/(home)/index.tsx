import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { NeonBorderCard } from '@/components/NeonBorderCard';
import { ScenarioQuickBar } from '@/components/ScenarioQuickBar';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { getLocation } from '@/core/locationCache';
import type { AiOverview } from '@/core/aiOverviewCache';
import { fetchIsLikelyRainNow } from '@/core/openMeteoWeather';
import { scoreRestaurantPool } from '@/core/recommendationEngine';
import { getRecommendationPrefs } from '@/core/recommendationPrefs';
import {
  inferMealTypeFromClock,
  radiusIdToMeters,
  type RecommendationPrefsV1,
  type ScoredRestaurant,
  DEFAULT_SESSION_BUDGET,
  DEFAULT_SESSION_GROUP,
  type SessionOverrides,
} from '@/core/recommendationTypes';
import { getCachedResults, setCachedResults } from '@/core/resultCache';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { appendVisit, loadVisits } from '@/core/recommendationVisitHistory';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
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
  Circle,
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

const WINDOW_WIDTH = Dimensions.get('window').width;
const WINDOW_HEIGHT = Dimensions.get('window').height;
const SPOTLIGHT_RADAR_HEIGHT = Math.round(
  Math.min(WINDOW_HEIGHT * 0.52, WINDOW_WIDTH * 0.94, 540)
);
const SPOTLIGHT_RADAR_INLINE_HEIGHT = Math.round(
  Math.min(WINDOW_HEIGHT * 0.28, WINDOW_WIDTH * 0.5, 220)
);
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
const DEFAULT_NEON_RING_COLORS: [string, string, string, string] = [
  NEON_CYAN,
  '#9400FF',
  NEON_MAGENTA,
  NEON_CYAN,
];

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

function HomeNeonTitle({ text, width }: { text: string; width: number }) {
  const gid = useId().replace(/:/g, '');
  const h = 42;
  return (
    <View style={{ height: h, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
      <Svg width={width} height={h}>
        <Defs>
          <SvgLinearGradient id={`htl-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={NEON_CYAN} />
            <Stop offset="1" stopColor={NEON_MAGENTA} />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          fill={`url(#htl-${gid})`}
          fontSize={29}
          fontWeight="800"
          x={width / 2}
          y={31}
          textAnchor="middle"
        >
          {text}
        </SvgText>
      </Svg>
    </View>
  );
}

function MatchGauge({
  match,
  arcColors,
  textColor = '#FFFFFF',
}: {
  match: number;
  arcColors: [string, string];
  textColor?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const size = 78;
  const cx = size / 2;
  const cy = size / 2;
  const r = 28;
  const C = 2 * Math.PI * r;
  const fillC = (Math.min(100, Math.max(0, match)) / 100) * C;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', left: 0, top: 0 }}
        pointerEvents="none"
      >
        <Defs>
          <SvgLinearGradient id={`mg-${gid}`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={arcColors[0]} />
            <Stop offset="1" stopColor={arcColors[1]} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(128,128,128,0.18)"
          strokeWidth={2.5}
          strokeDasharray="5 4"
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#mg-${gid})`}
          strokeWidth={3.5}
          strokeDasharray={`${fillC} ${C}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[styles.matchOrbPct, { color: textColor }]}>{match}</Text>
        <Text style={[styles.matchOrbLbl, { color: textColor }]}>match</Text>
      </View>
    </View>
  );
}

function NeonOutlinePad({
  borderRadius,
  neonColors,
  children,
}: {
  borderRadius: number;
  neonColors: [string, string, string, string];
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={neonColors}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{ borderRadius, padding: 1.5 }}
    >
      <View
        style={{
          borderRadius: borderRadius - 1.5,
          backgroundColor: '#000000',
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

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
  const axes: { key: keyof AiOverview; corner: string; max: 5 | 10 }[] = [
    { key: 'healthScore', corner: 'Health', max: 10 },
    { key: 'tasteScore', corner: 'Taste', max: 5 },
    { key: 'valueForMoneyScore', corner: 'Value', max: 5 },
    { key: 'dateWorthiness', corner: 'Date', max: 5 },
    { key: 'speedScore', corner: 'Speed', max: 5 },
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
    ? 'rgba(255,255,255,0.78)'
    : labelColor;
  const gridSW = useSketch ? 0.3 : neon ? 0.5 : 0.35;
  const outerGridSW = useSketch ? 0.35 : neon ? 0.55 : 0.45;
  const polygonSW = useSketch ? 1.5 : neon ? 1.45 : 1.25;

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
            return (
              <G key={corner}>
                <SvgText
                  x={lx}
                  y={ly - 2.4}
                  fill={ringLabel}
                  fontSize={5}
                  fontWeight="700"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {corner}
                </SvgText>
                <SvgText
                  x={lx}
                  y={ly + 3.6}
                  fill={ringLabel}
                  fontSize={4.1}
                  fontWeight="600"
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
          return (
            <G key={corner}>
              <SvgText
                x={lx}
                y={ly - 2.4}
                fill={ringLabel}
                fontSize={5}
                fontWeight="700"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {corner}
              </SvgText>
              <SvgText
                x={lx}
                y={ly + 3.6}
                fill={ringLabel}
                fontSize={4.1}
                fontWeight="600"
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

function EngineStatBars({ raw, compact, neon }: { raw: ScoredRestaurant['raw']; compact?: boolean; neon?: boolean }) {
  const { theme } = useAppTheme();
  const rows: { label: string; value: number; colors: [string, string] }[] = [
    { label: 'Distance', value: raw.distance, colors: ['#38BDF8', '#0EA5E9'] },
    { label: 'Health', value: raw.health, colors: ['#4ADE80', '#22C55E'] },
    { label: 'Price', value: raw.price, colors: ['#FACC15', '#EAB308'] },
    { label: 'Rated', value: raw.rating, colors: ['#F472B6', '#EC4899'] },
    { label: 'Novelty', value: raw.novelty, colors: ['#C084FC', '#A855F7'] },
  ];
  const labelCol = neon ? '#FFFFFF' : theme.subtext;
  const trackBg = neon ? 'rgba(255,255,255,0.08)' : theme.glassBackground;
  const useDots = !neon && theme.statBarVariant === 'dots';

  return (
    <View style={[styles.engineBars, compact && styles.engineBarsCompact]}>
      {rows.map(row => {
        if (useDots) {
          const dotSize = Math.round(7 + (clampScore(row.value, 100) / 100) * 7);
          return (
            <View key={row.label} style={[styles.engineBarRow, compact && styles.engineBarRowCompact]}>
              <Text style={[styles.engineBarLabel, compact && styles.engineBarLabelCompact, { color: labelCol }]}>{row.label}</Text>
              <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: row.colors[0] }} />
            </View>
          );
        }
        return (
          <View key={row.label} style={[styles.engineBarRow, compact && styles.engineBarRowCompact]}>
            <Text style={[styles.engineBarLabel, compact && styles.engineBarLabelCompact, { color: labelCol }]}>{row.label}</Text>
            <View style={[styles.engineBarTrack, compact && styles.engineBarTrackCompact, { backgroundColor: trackBg }]}>
              <View style={[styles.engineBarFillWrap, { width: `${clampScore(row.value, 100)}%` as DimensionValue }]}>
                <LinearGradient
                  colors={row.colors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            </View>
          </View>
        );
      })}
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
  const place = scored.place;
  const name = place.displayName?.text || 'Unknown';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;
  const match = Math.round(scored.plateboundScore);
  const ai = place.aiOverview as AiOverview | null | undefined;
  const reviewCount =
    typeof place.userRatingCount === 'number' && place.userRatingCount > 0
      ? `${place.userRatingCount.toLocaleString()} reviews`
      : null;

  const neonUi = Boolean(theme.neonColors);
  const ringColors = theme.neonColors ?? DEFAULT_NEON_RING_COLORS;
  const orbVariant = theme.matchOrbVariant ?? 'segmented';
  const orbTextColor = theme.matchOrbTextColor ?? '#FFFFFF';
  const radarVar = theme.radarVariant ?? 'solid';
  const btnVariant = theme.buttonVariant ?? 'primary-ghost';

  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
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
        .enabled(canReject)
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
        .onEnd((_e, success) => {
          if (success) runOnJS(firePress)();
        }),
    [firePress]
  );

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  const cardBody = (
    <>
      <View style={styles.spotlightHeroRow}>
        <View style={styles.spotlightTitleBlock}>
          <Text style={[styles.spotlightTitle, { color: theme.text }]} numberOfLines={3}>
            {name}
          </Text>
          <Text style={[styles.spotlightSub, { color: theme.subtext }]} numberOfLines={2}>
            {formatDistance(Math.round(place.distanceMeters ?? 0))} away
            {rating ? ` · ${rating}★` : ''}
            {reviewCount ? ` · ${reviewCount}` : ''}
          </Text>
        </View>
        <View style={styles.matchOrb}>
          {orbVariant === 'gradient' ? (
            <LinearGradient colors={theme.matchOrbColors} style={styles.matchOrbGrad}>
              <Text style={[styles.matchOrbPct, { color: orbTextColor }]}>{match}</Text>
              <Text style={[styles.matchOrbLbl, { color: orbTextColor }]}>match</Text>
            </LinearGradient>
          ) : (
            <MatchGauge
              match={match}
              arcColors={neonUi ? [ringColors[0], ringColors[2]] as [string, string] : theme.matchOrbColors}
              textColor={orbTextColor}
            />
          )}
        </View>
      </View>

      <View style={styles.scoreShapeRow}>
        <View style={styles.scorePentagonCol}>
          <RestaurantScorePentagon
            ai={ai}
            stroke={theme.accent}
            gridColor={theme.radarGridColor}
            labelColor={theme.subtext}
            svgHeight={SPOTLIGHT_RADAR_INLINE_HEIGHT}
            neon={neonUi}
            variant={radarVar}
            gradientColors={neonUi ? undefined : theme.matchOrbColors}
          />
        </View>
        <View style={styles.scoreBarsCol}>
          <Text
            style={[
              styles.valueMatchHeading,
              { color: neonUi ? 'rgba(255,255,255,0.72)' : theme.subtext },
              neonUi && styles.valueMatchHeadingNeon,
            ]}
          >
            value match
          </Text>
          <EngineStatBars raw={scored.raw} compact neon={neonUi} />
        </View>
      </View>
    </>
  );

  const cardActions = (
    <View style={styles.spotlightActions}>
      {neonUi ? (
        <>
          <TouchableOpacity
            style={[!mapsReady && styles.spotlightActionDisabled, { flex: 1 }]}
            onPress={() => {
              if (!mapsReady) return;
              openMaps(name, lat, lng);
            }}
            disabled={!mapsReady}
            activeOpacity={0.88}
          >
            <NeonOutlinePad borderRadius={14} neonColors={ringColors}>
              <View style={[styles.spotlightActionInnerNeon, styles.spotlightActionRow]}>
                <Ionicons
                  name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.spotlightActionTextNeon} numberOfLines={1}>
                  {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
                </Text>
              </View>
            </NeonOutlinePad>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} onPress={onPress} activeOpacity={0.88}>
            <NeonOutlinePad borderRadius={14} neonColors={ringColors}>
              <View style={[styles.spotlightActionInnerNeon, styles.spotlightActionRow]}>
                <Ionicons name="information-circle-outline" size={16} color="#FFFFFF" />
                <Text style={styles.spotlightActionTextNeon} numberOfLines={1}>
                  Details
                </Text>
              </View>
            </NeonOutlinePad>
          </TouchableOpacity>
        </>
      ) : btnVariant === 'outline-outline' ? (
        <>
          <TouchableOpacity
            style={[
              styles.spotlightAction,
              styles.spotlightActionGhostBase,
              { backgroundColor: 'transparent', borderColor: theme.cardBorderColor },
              !mapsReady && styles.spotlightActionDisabled,
            ]}
            onPress={() => {
              if (!mapsReady) return;
              openMaps(name, lat, lng);
            }}
          >
            <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={16} color={theme.text} />
            <Text style={[styles.spotlightActionText, { color: theme.text }]} numberOfLines={1}>
              {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.spotlightAction,
              styles.spotlightActionGhostBase,
              { backgroundColor: 'transparent', borderColor: theme.cardBorderColor },
            ]}
            onPress={onPress}
          >
            <Ionicons name="information-circle-outline" size={16} color={theme.text} />
            <Text style={[styles.spotlightActionText, { color: theme.text }]} numberOfLines={1}>
              Details
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[
              styles.spotlightAction,
              styles.spotlightActionPrimaryBase,
              { backgroundColor: theme.accent },
              !mapsReady && styles.spotlightActionDisabled,
            ]}
            onPress={() => {
              if (!mapsReady) return;
              openMaps(name, lat, lng);
            }}
          >
            <Ionicons name={Platform.OS === 'ios' ? 'map' : 'logo-google'} size={16} color="#FFFFFF" />
            <Text style={styles.spotlightActionText} numberOfLines={1}>
              {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.spotlightAction,
              styles.spotlightActionGhostBase,
              { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
            ]}
            onPress={onPress}
          >
            <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
            <Text style={[styles.spotlightActionText, { color: theme.accent }]} numberOfLines={1}>
              Details
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const cardInner = (
    <Animated.View style={[styles.spotlightCardOuter, cardAnim]}>
      <NeonBorderCard borderRadius={26}>
        <View style={styles.spotlightPressLayer}>
          <GestureDetector
            gesture={canReject ? Gesture.Exclusive(panGesture, tapGesture) : tapGesture}
          >
            <View>{cardBody}</View>
          </GestureDetector>
          {cardActions}
        </View>
      </NeonBorderCard>
    </Animated.View>
  );

  return cardInner;
}

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const sessionRadiusRef = useRef(3000);
  const carouselRef = useRef<FlatList<ScoredRestaurant>>(null);

  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);
  const [session, setSession] = useState<SessionOverrides | null>(null);
  const [rawPlaces, setRawPlaces] = useState<any[]>([]);
  const [ranked, setRanked] = useState<ScoredRestaurant[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(() => new Set());
  const [filmstripRefreshing, setFilmstripRefreshing] = useState(false);
  const visibleLenRef = useRef(-1);
  const pickIndexRef = useRef(0);
  pickIndexRef.current = pickIndex;

  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'health');

  const visibleList = useMemo(() => {
    return ranked.slice(0, 10).filter(r => !rejectedIds.has(String(r.place?.id ?? '')));
  }, [ranked, rejectedIds]);

  const rejectPickAt = useCallback(
    (placeId: string) => {
      setRejectedIds(prev => {
        const curList = ranked.slice(0, 10).filter(r => !prev.has(String(r.place?.id ?? '')));
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
      setSession({
        mealType: inferMealTypeFromClock(),
        groupSize: DEFAULT_SESSION_GROUP,
        budgetCeiling: DEFAULT_SESSION_BUDGET,
        radiusMeters: radiusIdToMeters(p.defaultRadius),
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
    setPickIndex(0);
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
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
        setErrorMsg('Turn on location to get your daily pick.');
        setRawPlaces([]);
        return;
      }
      coordsRef.current = coords;
      const p = prefs ?? (await getRecommendationPrefs());
      const rad = sessionRadiusRef.current || radiusIdToMeters(p.defaultRadius);
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
        setErrorMsg('Could not load restaurants nearby.');
        setRawPlaces([]);
      }
    } finally {
      snapProgressComplete();
      if (!skipLoader) {
        setIsLoading(false);
      }
    }
  }, [onOrchestratorProgress, prefs, snapProgressComplete, startFetchPhase, startGpsPhase]);

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlight();
    }
  }, [loadSpotlight, prefs, session]);

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
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    setCurrentRestaurant(item.place);
    router.push('/random-result');
  };

  const noPlacesAtAll = !isLoading && !errorMsg && ranked.length === 0;
  const homeBottomPad = tabBarHeight + 12;
  const rootNeon = Boolean(theme.neonColors);
  const stripNeonColors = theme.neonColors ?? DEFAULT_NEON_RING_COLORS;
  const titleText =
    !isLoading && !errorMsg && !noPlacesAtAll && visibleList.length > 0
      ? `Top ${visibleList.length} picks`
      : 'Top 10 picks';

  const onFilmstripRefresh = useCallback(async () => {
    setFilmstripRefreshing(true);
    setRejectedIds(new Set());
    setPickIndex(0);
    carouselRef.current?.scrollToOffset({ offset: 0, animated: true });
    try {
      await loadSpotlight({ skipFullScreenLoader: true });
    } finally {
      setFilmstripRefreshing(false);
    }
  }, [loadSpotlight]);

  const homeBody = (
    <>
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.homeContent, { paddingBottom: homeBottomPad }]}>
          {rootNeon ? (
            <HomeNeonTitle text={titleText} width={WINDOW_WIDTH - 32} />
          ) : (
            <Text style={[styles.pageTitle, { color: theme.pageTitleColor }]}>{titleText}</Text>
          )}

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
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSpotlight()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : noPlacesAtAll ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>No restaurants matched your filters nearby.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSpotlight()}>
                <Text style={styles.retryText}>Refresh</Text>
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
                    {visibleList.length > 1 ? (
                      <Text style={[styles.cardSwipeTooltip, { color: theme.subtext }]}>
                        Swipe ↓ to skip
                      </Text>
                    ) : null}
                  </View>
                )}
              />
              <View style={styles.filmstripBar}>
                <TouchableOpacity
                  style={styles.filmstripRefreshBtn}
                  onPress={() => void onFilmstripRefresh()}
                  disabled={filmstripRefreshing}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh picks"
                >
                  {filmstripRefreshing ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Ionicons name="refresh-outline" size={22} color={theme.accent} />
                  )}
                </TouchableOpacity>
                <View style={[styles.filmstripWrap, { width: FILM_STRIP_WIDTH }]}>
                  <View style={[styles.filmstripRow, { gap: FILM_GAP, width: FILM_STRIP_WIDTH }]}>
                    {visibleList.map((scored, i) => {
                      const place = scored.place;
                      const pid = String(place?.id ?? i);
                      const palStd = FILMSTRIP_PALETTE[i % FILMSTRIP_PALETTE.length];
                      const palNeon = FILMSTRIP_PALETTE_NEON[i % FILMSTRIP_PALETTE_NEON.length];
                      const active = i === pickIndex;
                      const dist = Math.abs(i - pickIndex);
                      const scale = dist === 0 ? 1.46 : dist === 1 ? 0.94 : 0.78;
                      const iconName = stripIconForPlaceId(pid);
                      if (rootNeon) {
                        return (
                          <TouchableOpacity
                            key={pid}
                            activeOpacity={0.85}
                            onPress={() => goToPick(i)}
                            style={[
                              styles.filmstripThumbNeonOuter,
                              {
                                width: FILM_CARD_W,
                                height: FILM_CARD_H,
                                transform: [{ scale }],
                                zIndex: active ? 2 : 1,
                              },
                            ]}
                          >
                            {active ? (
                              <LinearGradient
                                colors={stripNeonColors}
                                start={{ x: 0, y: 1 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.filmstripThumbNeonGrad}
                              >
                                <View
                                  style={[
                                    styles.filmstripThumbNeonInner,
                                    { backgroundColor: palNeon.bg },
                                  ]}
                                >
                                  <Ionicons name={iconName} size={17} color={palNeon.mark} />
                                </View>
                              </LinearGradient>
                            ) : (
                              <View
                                style={[
                                  styles.filmstripThumbNeonInner,
                                  {
                                    backgroundColor: palNeon.bg,
                                    borderWidth: 1,
                                    borderColor: 'rgba(0,255,255,0.38)',
                                  },
                                ]}
                              >
                                <Ionicons name={iconName} size={17} color={palNeon.mark} />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={pid}
                          activeOpacity={0.85}
                          onPress={() => goToPick(i)}
                          style={[
                            styles.filmstripThumb,
                            {
                              width: FILM_CARD_W,
                              height: FILM_CARD_H,
                              backgroundColor: palStd.bg,
                              borderColor: active ? theme.accent : palStd.border,
                              transform: [{ scale }],
                              zIndex: active ? 2 : 1,
                            },
                            active && styles.filmstripThumbActive,
                          ]}
                        >
                          <Ionicons name={iconName} size={17} color={palStd.mark} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
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
  safeArea: { flex: 1, paddingTop: 56 },
  homeContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 18,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  galleryBlock: { marginHorizontal: -20, flexGrow: 0 },
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
    padding: 18,
    gap: 12,
  },
  spotlightHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  spotlightTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    gap: 6,
  },
  spotlightTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
  },
  spotlightSub: { fontSize: 12 },
  matchOrb: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
  },
  matchOrbGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  matchOrbPct: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginTop: -2 },
  matchOrbLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  scoreShapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scorePentagonCol: {
    flex: 1.55,
    minWidth: 0,
    alignItems: 'stretch',
  },
  scoreBarsCol: {
    flex: 0.55,
    minWidth: 0,
    justifyContent: 'center',
  },
  valueMatchHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueMatchHeadingNeon: {
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 9,
  },
  radarBlock: { width: '100%', marginTop: 0 },
  engineBars: { gap: 6, marginTop: 0 },
  engineBarsCompact: { gap: 3, marginTop: 0 },
  engineBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engineBarRowCompact: { gap: 4 },
  engineBarLabel: { width: 72, fontSize: 10, fontWeight: '600' },
  engineBarLabelCompact: { width: 52, fontSize: 8.5 },
  engineBarTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  engineBarTrackCompact: { height: 5, borderRadius: 3 },
  engineBarFillWrap: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  spotlightActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  spotlightActionInnerNeon: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  spotlightActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spotlightActionTextNeon: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  spotlightAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  spotlightActionPrimaryBase: {},
  spotlightActionGhostBase: { borderWidth: 1 },
  spotlightActionDisabled: { opacity: 0.45 },
  spotlightActionText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
