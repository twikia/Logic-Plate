import { Image } from 'expo-image';
import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { NeonBorderCard } from '@/components/NeonBorderCard';
import { NeonGradientTitle } from '@/components/NeonGradientTitle';
import { RestaurantCarousel } from '@/components/RestaurantCarousel';
import { LaunchIntentSurvey } from '@/components/LaunchIntentSurvey';
import { subscribeLaunchIntent } from '@/core/launchIntent';
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
import {
  DEFAULT_SEARCH_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
} from '@/core/searchRadiusOptions';
import { getCachedResults, setCachedResults } from '@/core/resultCache';
import {
  getNearbyRestaurants,
  isRestaurantFetchError,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { fetchRestaurantPhotoUrls } from '@/core/images';
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
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { registerGlobalPress, TouchableOpacity } from '@/components/ui/soundPressable';
import {
  BackHandler,
  Dimensions,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlatList, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle as SvgCircle,
  Defs,
  Ellipse as SvgEllipse,
  FeGaussianBlur,
  Filter,
  G,
  Line as SvgLine,
  LinearGradient as SvgLinearGradient,
  Path as SvgPath,
  Pattern,
  Polygon,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { playSuccess } from '@/core/audioService';
import { hapticMedium, hapticSuccess } from '@/core/haptics';

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

const WATERCOLOR_FILLS = [
  '#F0A8B8',
  '#9ABCD8',
  '#B4CC58',
  '#B0A0D8',
  '#ECA888',
] as const;

function PaperFoodIllustrations({ tabBarHeight }: { tabBarHeight: number }) {
  const STROKE = 'rgba(115,85,50,0.22)';
  const FILL_S = 'rgba(200,170,130,0.07)';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Donut — upper left */}
      <View style={{ position: 'absolute', top: -35, left: -30 }}>
        <Svg width={140} height={140} viewBox="0 0 120 120">
          <SvgPath
            d="M 60 12 C 36 12 12 35 12 60 C 12 85 35 108 60 108 C 85 108 108 85 108 60 C 108 35 85 12 60 12 Z M 60 42 C 49 42 42 49 42 60 C 42 71 49 78 60 78 C 71 78 78 71 78 60 C 78 49 71 42 60 42 Z"
            fill={FILL_S} stroke={STROKE} strokeWidth={1.5} fillRule="evenodd"
          />
          <SvgPath
            d="M 24 54 Q 36 22 60 18 Q 84 22 96 54 Q 80 68 60 66 Q 40 68 24 54 Z"
            fill="rgba(200,170,130,0.1)" stroke={STROKE} strokeWidth={0.9}
          />
          <SvgLine x1={42} y1={30} x2={48} y2={24} stroke={STROKE} strokeWidth={2.6} strokeLinecap="round" />
          <SvgLine x1={56} y1={23} x2={61} y2={17} stroke={STROKE} strokeWidth={2.6} strokeLinecap="round" />
          <SvgLine x1={70} y1={26} x2={76} y2={21} stroke={STROKE} strokeWidth={2.3} strokeLinecap="round" />
          <SvgLine x1={84} y1={36} x2={89} y2={31} stroke={STROKE} strokeWidth={2.1} strokeLinecap="round" />
          <SvgLine x1={33} y1={41} x2={38} y2={36} stroke={STROKE} strokeWidth={2.1} strokeLinecap="round" />
          <SvgLine x1={24} y1={53} x2={29} y2={48} stroke={STROKE} strokeWidth={1.9} strokeLinecap="round" />
        </Svg>
      </View>

      {/* Pizza slice — upper right */}
      <View style={{ position: 'absolute', top: -28, right: -30 }}>
        <Svg width={120} height={120} viewBox="0 0 100 100">
          <SvgPath
            d="M 50 95 L 8 20 Q 28 5 50 3 Q 72 5 92 20 Z"
            fill={FILL_S} stroke={STROKE} strokeWidth={1.5} strokeLinejoin="round"
          />
          <SvgPath
            d="M 8 20 Q 28 5 50 3 Q 72 5 92 20"
            fill="none" stroke={STROKE} strokeWidth={5.5} strokeLinecap="round" strokeOpacity={0.35}
          />
          <SvgPath
            d="M 22 38 Q 50 33 78 38"
            fill="none" stroke={STROKE} strokeWidth={0.7} strokeDasharray="3 2.5"
          />
          <SvgEllipse cx={38} cy={46} rx={6} ry={6} fill="rgba(180,130,80,0.13)" stroke={STROKE} strokeWidth={1} />
          <SvgEllipse cx={64} cy={46} rx={5} ry={5} fill="rgba(180,130,80,0.13)" stroke={STROKE} strokeWidth={1} />
          <SvgEllipse cx={50} cy={62} rx={6} ry={6} fill="rgba(180,130,80,0.13)" stroke={STROKE} strokeWidth={1} />
          <SvgEllipse cx={35} cy={64} rx={4} ry={4} fill="rgba(180,130,80,0.13)" stroke={STROKE} strokeWidth={0.9} />
        </Svg>
      </View>

      {/* Coffee cup — lower left */}
      <View style={{ position: 'absolute', bottom: tabBarHeight + 95, left: -20 }}>
        <Svg width={115} height={125} viewBox="0 0 100 110">
          <SvgPath
            d="M 22 30 L 28 88 L 72 88 L 78 30 Z"
            fill={FILL_S} stroke={STROKE} strokeWidth={1.4} strokeLinejoin="round"
          />
          <SvgEllipse cx={50} cy={30} rx={28} ry={8} fill={FILL_S} stroke={STROKE} strokeWidth={1.2} />
          <SvgEllipse cx={50} cy={90} rx={34} ry={7} fill={FILL_S} stroke={STROKE} strokeWidth={1} />
          <SvgPath d="M 78 42 Q 100 56 78 72" fill="none" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" />
          <SvgPath d="M 37 22 Q 41 13 37 5" fill="none" stroke={STROKE} strokeWidth={1.0} strokeLinecap="round" />
          <SvgPath d="M 50 20 Q 54 11 50 3" fill="none" stroke={STROKE} strokeWidth={1.0} strokeLinecap="round" />
          <SvgPath d="M 63 22 Q 67 13 63 5" fill="none" stroke={STROKE} strokeWidth={1.0} strokeLinecap="round" />
        </Svg>
      </View>

      {/* Compass — lower right */}
      <View style={{ position: 'absolute', bottom: tabBarHeight + 65, right: -18 }}>
        <Svg width={108} height={108} viewBox="0 0 100 100">
          <SvgCircle cx={50} cy={50} r={44} fill="none" stroke={STROKE} strokeWidth={1.4} />
          <SvgCircle cx={50} cy={50} r={39} fill="none" stroke={STROKE} strokeWidth={0.5} strokeDasharray="2.5 2" />
          <SvgPath d="M 50 10 L 43 36 L 50 29 L 57 36 Z" fill={STROKE} fillOpacity={0.6} />
          <SvgPath d="M 50 90 L 43 64 L 50 71 L 57 64 Z" fill={STROKE} fillOpacity={0.25} />
          <SvgPath d="M 90 50 L 64 43 L 71 50 L 64 57 Z" fill={STROKE} fillOpacity={0.25} />
          <SvgPath d="M 10 50 L 36 43 L 29 50 L 36 57 Z" fill={STROKE} fillOpacity={0.25} />
          <SvgCircle cx={50} cy={50} r={7} fill={FILL_S} stroke={STROKE} strokeWidth={1} />
          <SvgCircle cx={50} cy={50} r={2.5} fill={STROKE} fillOpacity={0.55} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const angle = (i * Math.PI * 2) / 8;
            const x1 = 50 + 36 * Math.cos(angle);
            const y1 = 50 + 36 * Math.sin(angle);
            const x2 = 50 + 41 * Math.cos(angle);
            const y2 = 50 + 41 * Math.sin(angle);
            return <SvgLine key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={1.1} strokeLinecap="round" />;
          })}
        </Svg>
      </View>

      {/* Small bread roll — right side mid-screen */}
      <View style={{ position: 'absolute', top: WINDOW_HEIGHT * 0.33, right: -14 }}>
        <Svg width={75} height={65} viewBox="0 0 80 70">
          <SvgPath
            d="M 6 52 Q 5 10 40 6 Q 75 10 74 52 Z"
            fill={FILL_S} stroke={STROKE} strokeWidth={1.3} strokeLinejoin="round"
          />
          <SvgPath d="M 6 52 Q 40 58 74 52" fill="none" stroke={STROKE} strokeWidth={1.0} />
          <SvgLine x1={20} y1={27} x2={60} y2={26} stroke={STROKE} strokeWidth={0.7} strokeDasharray="3 2" />
          <SvgLine x1={22} y1={36} x2={58} y2={35} stroke={STROKE} strokeWidth={0.6} strokeDasharray="2.5 2" />
        </Svg>
      </View>
    </View>
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

type RadarAxisDef = {
  key: keyof AiOverview;
  corner: string;
  max: 5 | 10;
  icon: string;
};

const RADAR_LABEL_OFFSETS: Partial<
  Record<keyof AiOverview, { dx?: number; dy?: number; dr?: number }>
> = {
  healthScore: { dr: -1.4 },
  tasteScore: { dx: 1.3 },
  speedScore: { dx: -1.3 },
};

function renderRadarAxisLabels(
  axes: RadarAxisDef[],
  ai: AiOverview | null | undefined,
  n: number,
  cx: number,
  cy: number,
  labelR: number,
  cornerFontSize: number,
  scoreFontSize: number,
  ringLabel: string
) {
  return axes.map(({ key, corner, max, icon }, i) => {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const offset = RADAR_LABEL_OFFSETS[key] ?? {};
    const r = labelR + (offset.dr ?? 0);
    const lx = cx + r * Math.cos(t) + (offset.dx ?? 0);
    const ly = cy + r * Math.sin(t) + (offset.dy ?? 0);
    const s = scoreAxis(ai, key);
    const reading = formatAxisReading(max, s);
    const labelFill = absoluteScoreColor(s, max, ringLabel);
    const scoreFill = absoluteScoreColor(s, max, ringLabel);
    return (
      <G key={corner}>
        <SvgText
          x={lx}
          y={ly - 2.4}
          fill={labelFill}
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
          {`${icon} ${reading}`}
        </SvgText>
      </G>
    );
  });
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
  overallScore,
}: {
  ai: AiOverview | null | undefined;
  stroke: string;
  gridColor?: string;
  labelColor?: string;
  svgHeight?: number;
  neon?: boolean;
  variant?: 'solid' | 'gradient' | 'sketch' | 'watercolor';
  gradientColors?: [string, string];
  overallScore?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const n = 5;
  const { t: radarT } = useTranslation();
  const axes: RadarAxisDef[] = [
    { key: 'healthScore', corner: radarT('home.radarHealth'), max: 10, icon: '🥗' },
    { key: 'tasteScore', corner: radarT('home.radarTaste'), max: 5, icon: '👅' },
    { key: 'valueForMoneyScore', corner: radarT('home.radarValue'), max: 5, icon: '💵' },
    { key: 'dateWorthiness', corner: radarT('home.radarDate'), max: 5, icon: '💕' },
    { key: 'speedScore', corner: radarT('home.radarSpeed'), max: 5, icon: '⏱️' },
  ];
  const norms = axes.map(({ key, max }) => {
    const s = scoreAxis(ai, key);
    if (s == null) return 0;
    return clampScore(s, max) / max;
  });
  const cx = 50;
  const cy = 50;
  const R = 40;
  const labelR = 49;
  const fillPts = norms
    .map((norm, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const r = norm * R;
      return `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`;
    })
    .join(' ');

  const useGradient = neon || variant === 'gradient';
  const useSketch = !neon && variant === 'sketch';
  const useWatercolor = !neon && variant === 'watercolor';

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

  const centerScoreFill = overallScore != null
    ? overallScore >= 80 ? '#4ADE80' : overallScore >= 50 ? '#FBBF24' : '#F87171'
    : 'transparent';

  const centerScoreText = overallScore != null ? Math.round(overallScore).toString() : '';

  const renderCenter = () => {
    if (overallScore == null) return null;
    return (
      <SvgText
        x={cx}
        y={cy + 3}
        fill={centerScoreFill}
        fontSize={20}
        fontWeight="900"
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {centerScoreText}
      </SvgText>
    );
  };

  if (useWatercolor) {
    const WFILLS = WATERCOLOR_FILLS;
    const fillPointsArr = norms.map((norm, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: cx + norm * R * Math.cos(t), y: cy + norm * R * Math.sin(t) };
    });
    const wcLabel = 'rgba(65,40,18,0.85)';
    return (
      <View style={styles.radarBlock}>
        <Svg width="100%" height={svgHeight} viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet">
          <Defs>
            <Filter id={`wcf-${gid}`} x="-35%" y="-35%" width="170%" height="170%" filterUnits="objectBoundingBox">
              <FeGaussianBlur stdDeviation="3.5" />
            </Filter>
            <Pattern id={`wcp-${gid}`} x="0" y="0" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-32 50 50)">
              <SvgLine x1="-4" y1="0" x2="17" y2="0" stroke="rgba(100,70,40,1)" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.04" />
              <SvgLine x1="-4" y1="6.5" x2="17" y2="6.5" stroke="rgba(100,70,40,1)" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.03" />
            </Pattern>
          </Defs>

          {/* Pencil-style grid rings */}
          <Polygon points={polygonRing(cx, cy, R * 0.34, n)} fill="none" stroke="rgba(120,85,50,0.08)" strokeWidth={0.3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 0.7 2.5 0.6 3.5 0.7" />
          <Polygon points={polygonRing(cx, cy, R * 0.67, n)} fill="none" stroke="rgba(120,85,50,0.08)" strokeWidth={0.3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 0.8 3 0.6 4 0.7" />
          <Polygon points={polygonRing(cx, cy, R, n)} fill="none" stroke="rgba(120,85,50,0.10)" strokeWidth={0.35} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5.5 0.8 3.5 0.7 4.5 0.8" />

          {/* Blurred watercolor halo — extends to outer ring for bleeding effect */}
          {Array.from({ length: n }, (_, i) => {
            const next = (i + 1) % n;
            const ti = -Math.PI / 2 + (2 * Math.PI * i) / n;
            const tn = -Math.PI / 2 + (2 * Math.PI * next) / n;
            const orPts = `${cx},${cy} ${(cx + (R + 10) * Math.cos(ti)).toFixed(2)},${(cy + (R + 10) * Math.sin(ti)).toFixed(2)} ${(cx + (R + 10) * Math.cos(tn)).toFixed(2)},${(cy + (R + 10) * Math.sin(tn)).toFixed(2)}`;
            return <Polygon key={`wch-${i}`} points={orPts} fill={WFILLS[i]} fillOpacity={0.38} filter={`url(#wcf-${gid})`} />;
          })}

          {/* Crisp fill sections clipped to score polygon */}
          {fillPointsArr.map((fp, i) => {
            const next = fillPointsArr[(i + 1) % n];
            return (
              <Polygon
                key={`wcfl-${i}`}
                points={`${cx},${cy} ${fp.x.toFixed(2)},${fp.y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`}
                fill={WFILLS[i]}
                fillOpacity={0.26}
              />
            );
          })}

          {/* Cross-hatch paper texture */}
          <Polygon points={fillPts} fill={`url(#wcp-${gid})`} />

          {/* Sketch brush stroke outline — three layers for depth */}
          <Polygon points={fillPts} fill="none" stroke="rgba(110,75,40,0.11)" strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />
          <Polygon points={fillPts} fill="none" stroke="rgba(110,75,40,0.5)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="7.5 0.8 4.5 0.6 6.5 0.8 3 0.5 5 0.7" />
          <Polygon points={fillPts} fill="none" stroke="rgba(110,75,40,0.72)" strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5.5 1.2 3.5 0.9 4.5 1 2.5 0.8 4 1.1" />

          {renderRadarAxisLabels(axes, ai, n, cx, cy, labelR, cornerFontSize, scoreFontSize, wcLabel)}
        </Svg>
      </View>
    );
  }

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

          {renderRadarAxisLabels(axes, ai, n, cx, cy, labelR, cornerFontSize, scoreFontSize, ringLabel)}
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
        {renderRadarAxisLabels(axes, ai, n, cx, cy, labelR, cornerFontSize, scoreFontSize, ringLabel)}
      </Svg>
    </View>
  );
}

const thumbWidthByPlace = new Map<string, number>();

function SpotlightCard({
  scored,
  onReject,
  onPress,
  isDriveMode,
}: {
  scored: ScoredRestaurant;
  onReject: () => void;
  onPress: () => void;
  isDriveMode?: boolean;
}) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const place = scored.place;
  // v2 (Overture) fields with v1 (Google) fallbacks
  const name = place.name || place.displayName?.text || t('common.unknown');
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance, formatWalkingTime, formatDrivingTime } = useDistanceFormatter();
  const rating = (place.rating != null && place.rating > 0) ? Number(place.rating).toFixed(1) : null;
  const reviews = place.userRatingCount ?? null;
  const costLabel = formatRestaurantCostLabel(place); // cascades priceRange → priceLevel → priceTier → '-'
  const ai = place.aiOverview as AiOverview | null | undefined;
  const neonUi = Boolean(theme.neonColors);
  const radarVar = theme.radarVariant ?? 'solid';

  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const panStartY = useSharedValue(0);
  const placeId = String(place?.id ?? '');

  const [thumbWidth, setThumbWidth] = useState(
    () => thumbWidthByPlace.get(placeId) ?? SPOTLIGHT_THUMB_SIZE,
  );
  const handleImageDimensions = useCallback((w: number, h: number) => {
    if (w > h) {
      const aspect = Math.min(16 / 9, w / h);
      const next = Math.round(SPOTLIGHT_THUMB_SIZE * aspect);
      thumbWidthByPlace.set(placeId, next);
      setThumbWidth(next);
    }
  }, [placeId]);

  const rejectRef = useRef(onReject);
  rejectRef.current = onReject;
  const fireReject = useCallback(() => {
    rejectRef.current();
  }, []);

  useEffect(() => {
    ty.value = 0;
    opacity.value = 1;
  }, [placeId, ty, opacity]);

  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const firePress = useCallback(() => {
    if (!registerGlobalPress(500)) return;
    playSuccess();
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
    [fireReject, opacity, panStartY, ty]
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

  const CARD_INNER_WIDTH = WINDOW_WIDTH - 40 - (SPOTLIGHT_CARD_INSET * 2);

  const cardBody = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: SPOTLIGHT_THUMB_SIZE }}>
        <View style={{ width: thumbWidth, height: SPOTLIGHT_THUMB_SIZE, borderRadius: 14, overflow: 'hidden', marginRight: 12 }}>
          <RestaurantCarousel
            place={place}
            width={thumbWidth}
            height={SPOTLIGHT_THUMB_SIZE}
            borderRadius={14}
            startIndex={0}
            autoRotate={true}
            quality={400}
            onImageDimensions={handleImageDimensions}
          />
        </View>
        <View style={[styles.spotlightHeroText, { marginLeft: 0, flex: 1 }]}>
          <Text style={[styles.spotlightTitle, { color: theme.text, fontFamily: theme.fontFamily }]} numberOfLines={2}>
            {name}
          </Text>
          <View style={styles.spotlightMetaRow}>
          <View
            style={[
              styles.spotlightMetaPill,
              neonUi
                ? styles.spotlightMetaPillNeon
                : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
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
                : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
            ]}
          >
            <Ionicons name={isDriveMode ? "car-outline" : "walk-outline"} size={11} color={neonUi ? NEON_CYAN : theme.accent} />
            <Text
              style={[
                styles.spotlightMetaText,
                { color: neonUi ? 'rgba(255,255,255,0.92)' : theme.subtext },
              ]}
            >
              {isDriveMode
                ? formatDrivingTime(Math.round(place.distanceMeters ?? 0))
                : formatWalkingTime(Math.round(place.distanceMeters ?? 0))}
            </Text>
          </View>
          {scored.plateboundScore > 0 ? (
            <View
              style={[
                styles.spotlightMetaPill,
                neonUi
                  ? styles.spotlightMetaPillNeon
                  : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
              ]}
            >
              <Ionicons name="ribbon-outline" size={11} color="#4ADE80" />
              <Text style={[styles.spotlightMetaText, { color: '#4ADE80', fontWeight: '800' }]}>
                {Math.round(scored.plateboundScore)}%
              </Text>
            </View>
          ) : null}
          {rating ? (
            <View
              style={[
                styles.spotlightMetaPill,
                neonUi
                  ? styles.spotlightMetaPillNeon
                  : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
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
                  : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
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
          overallScore={scored.plateboundScore}
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
                : theme.buttonVariant === 'outline-outline'
                  ? { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }
                  : { backgroundColor: theme.accent, borderColor: theme.accent },
              !mapsReady && styles.spotlightMapsBtnDisabled,
            ]}
            onPress={() => { if (!mapsReady) return; hapticSuccess(); openMaps(name, lat, lng); }}
            disabled={!mapsReady}
            activeOpacity={0.85}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
              size={22}
              color={neonUi ? NEON_CYAN : (theme.buttonVariant === 'outline-outline' ? theme.text : '#FFFFFF')}
            />
            <Text
              style={[
                styles.spotlightMapsBtnText,
                { color: neonUi ? NEON_CYAN : (theme.buttonVariant === 'outline-outline' ? theme.text : '#FFFFFF') },
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

const MemoSpotlightCard = React.memo(SpotlightCard, (prev, next) => (
  prev.scored.place?.id === next.scored.place?.id &&
  prev.scored.plateboundScore === next.scored.plateboundScore &&
  prev.isDriveMode === next.isDriveMode &&
  prev.scored.place?.aiOverview === next.scored.place?.aiOverview
));

function HomeCarouselCard({
  item,
  isDriveMode,
  onReject,
  onPress,
}: {
  item: ScoredRestaurant;
  isDriveMode: boolean;
  onReject: (placeId: string) => void;
  onPress: (item: ScoredRestaurant) => void;
}) {
  const placeId = String(item.place?.id ?? '');
  const handleReject = useCallback(() => onReject(placeId), [onReject, placeId]);
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <View style={styles.carouselPage}>
      <MemoSpotlightCard
        scored={item}
        isDriveMode={isDriveMode}
        onReject={handleReject}
        onPress={handlePress}
      />
    </View>
  );
}

const MemoHomeCarouselCard = React.memo(HomeCarouselCard, (prev, next) => (
  prev.item.place?.id === next.item.place?.id &&
  prev.item.plateboundScore === next.item.plateboundScore &&
  prev.isDriveMode === next.isDriveMode &&
  prev.item.place?.aiOverview === next.item.place?.aiOverview &&
  prev.onReject === next.onReject &&
  prev.onPress === next.onPress
));

function AnimatedDot({ active, accentColor, inactiveColor }: { active: boolean; accentColor: string; inactiveColor: string }) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.25, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [active, scale, glowOpacity]);

  const dotAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowAnim = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={{ width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
      {active && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: accentColor,
            },
            glowAnim,
          ]}
        />
      )}
      <Animated.View
        style={[
          {
            width: active ? 9 : 6,
            height: active ? 9 : 6,
            borderRadius: active ? 4.5 : 3,
            backgroundColor: active ? accentColor : inactiveColor,
          },
          dotAnim,
        ]}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const sessionRadiusRef = useRef(DEFAULT_SEARCH_RADIUS_METERS);
  const hasFocusedOnceRef = useRef(false);
  const skipNextFocusReloadRef = useRef(false);
  const lastPrefsRevisionRef = useRef<number | null>(null);
  const carouselRef = useRef<FlatList<ScoredRestaurant>>(null);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [])
  );

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

function applyHomeFeedRandomness(scored: any[]): any[] {
  if (scored.length <= 5) return scored;
  const top1 = scored[0];
  const candidatesTop4 = scored.slice(1, 5);
  const pool = scored.slice(5, Math.min(scored.length, 13));

  if (pool.length === 0) return scored;

  const u = Math.random();
  let k = 0;
  if (u < 0.25) k = 0;
  else if (u < 0.65) k = 1;
  else if (u < 0.92) k = 2;
  else k = Math.min(3, candidatesTop4.length, pool.length);

  if (k === 0) return scored;

  const shuffledCandidates = [...candidatesTop4].sort(() => Math.random() - 0.5);
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

  const keptCandidates = shuffledCandidates.slice(k);
  const broughtIn = shuffledPool.slice(0, k);
  const remainingPool = shuffledPool.slice(k);
  const restOfPool = scored.slice(Math.min(scored.length, 13));

  const newTop5 = [top1, ...keptCandidates, ...broughtIn].sort((a, b) => b.plateboundScore - a.plateboundScore);
  const remainingAll = [...shuffledCandidates.slice(0, k), ...remainingPool, ...restOfPool].sort((a, b) => b.plateboundScore - a.plateboundScore);

  return [...newTop5, ...remainingAll];
}

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
    
    if (scored.length < 5 && sessionRadiusRef.current < MAX_SEARCH_RADIUS_METERS) {
      sessionRadiusRef.current = Math.min(MAX_SEARCH_RADIUS_METERS, sessionRadiusRef.current * 1.5);
      void loadSpotlightRef.current({ skipFullScreenLoader: true });
      return;
    }

    const randomizedFeed = applyHomeFeedRandomness(scored);
    setRanked(randomizedFeed);
    setRejectedIds(new Set());
    const nextVisibleLen = Math.max(0, randomizedFeed.slice(0, 5).length - 1);
    const nextPick = Math.min(pickIndexRef.current, nextVisibleLen);
    setPickIndex(nextPick);
    carouselRef.current?.scrollToOffset({ offset: nextPick * CAROUSEL_PAGE, animated: false });
  }, [prefs, session, rawPlaces]);

  useEffect(() => {
    return subscribeLaunchIntent(() => {
      void recompute();
    });
  }, [recompute]);

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

  const spotlightLoadingRef = useRef(false);
  const loadSpotlightRef = useRef<(opts?: { skipFullScreenLoader?: boolean }) => Promise<void>>(async () => {});

  const loadSpotlight = useCallback(async (opts?: { skipFullScreenLoader?: boolean }) => {
    if (spotlightLoadingRef.current) return;
    spotlightLoadingRef.current = true;
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
        setErrorMsg(i18n.t('home.locationError'));
        setRawPlaces([]);
        return;
      }
      coordsRef.current = coords;
      const rad = sessionRadiusRef.current;
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
      
      let all: any[] = [];
      let currentRad = rad;
      let finalCacheKey = cacheKey;
      
      while (currentRad <= MAX_SEARCH_RADIUS_METERS) {
        all = await getNearbyRestaurants(
          coords.latitude,
          coords.longitude,
          currentRad,
          hadCachedPlaces ? undefined : onOrchestratorProgress,
          {
            onAiReady: enriched => {
              void setCachedResults(finalCacheKey, enriched);
              setRawPlaces(enriched);
            },
          }
        );
        if (all.length > 0 || currentRad >= MAX_SEARCH_RADIUS_METERS) break;
        
        currentRad = Math.min(currentRad * 2, MAX_SEARCH_RADIUS_METERS);
        finalCacheKey = `${SPOTLIGHT_RESULTS_CACHE_PREFIX}_${Math.round(currentRad)}`;
        console.log(`[Auto-fallback] No restaurants found, stepping up radius to ${currentRad}m...`);
        // Force hadCachedPlaces false so progress bar runs for next pass
        hadCachedPlaces = false;
      }

      await setCachedResults(finalCacheKey, all);
      setRawPlaces(all);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      if (isRestaurantFetchError(e)) {
        if (__DEV__) console.warn('[restaurants]', e.message, e.cause);
      } else {
        if (__DEV__) console.warn('[home load]', e);
      }
      if (!hadCachedPlaces) {
        setErrorMsg(i18n.t('home.loadError'));
        setRawPlaces([]);
      }
    } finally {
      spotlightLoadingRef.current = false;
      snapProgressComplete();
      if (!skipLoader) {
        // Small delay to allow state to flush to UI before hiding loader
        setTimeout(() => setIsLoading(false), 50);
      }
    }
  }, [onOrchestratorProgress, snapProgressComplete, startFetchPhase, startGpsPhase]);

  loadSpotlightRef.current = loadSpotlight;

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlightRef.current();
    }
  }, [prefs, session]);

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
        void loadSpotlightRef.current();
      });
    }, [restoreCarouselPosition])
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

  const openDetails = useCallback(async (item: ScoredRestaurant) => {
    skipNextFocusReloadRef.current = true;
    markHomeOpeningDetails(pickIndexRef.current);
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    const enrichedPlace = { ...item.place, _matchScore: item.plateboundScore };
    setCurrentRestaurant(enrichedPlace);
    setTimeout(() => {
      Image.clearMemoryCache();
      router.push('/random-result');
    }, 0);
  }, [router]);

  const isDriveMode = (session?.radiusMeters ?? DEFAULT_SEARCH_RADIUS_METERS) > 1000;

  const renderCarouselItem = useCallback(
    ({ item }: { item: ScoredRestaurant }) => (
      <MemoHomeCarouselCard
        item={item}
        isDriveMode={isDriveMode}
        onReject={rejectPickAt}
        onPress={openDetails}
      />
    ),
    [isDriveMode, rejectPickAt, openDetails]
  );

  useEffect(() => {
    for (const item of visibleList) {
      const place = item.place;
      if (!place?.id || !(place.name || place.displayName?.text) || !place.location) continue;
      const placeName = place.name || place.displayName?.text;
      const cuisineKey = place.cuisineKey || place.aiOverview?.cuisineKey || place.category?.replace(/_restaurant$/, '') || place.primaryType?.replace(/_restaurant$/, '') || undefined;
      void fetchRestaurantPhotoUrls({
        placeId: String(place.id),
        name: placeName,
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        websiteUrl: place.website_url || place.websiteUri || undefined,
        formattedAddress: place.address || place.formattedAddress || undefined,
        cuisineKey,
      });
    }
  }, [visibleList]);

  // Fix loading flash: don't consider it noPlacesAtAll if we are still fetching or have a radius pending
  const noPlacesAtAll = !isLoading && !errorMsg && ranked.length === 0 && !spotlightLoadingRef.current;
  const homeBottomPad = tabBarHeight + 12;
  const rootNeon = Boolean(theme.neonColors);
  const [funTitle, setFunTitle] = useState(pickFunHomeTitle);

  useEffect(() => onHomeTitleReroll(() => setFunTitle(pickFunHomeTitle())), []);
  useEffect(() => {
    setFunTitle(pickFunHomeTitle());
  }, [i18n.language]);

  const homeBody = (
    <>
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.homeContent, { paddingBottom: homeBottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                hapticMedium();
                void loadSpotlight({ skipFullScreenLoader: true });
              }}
              tintColor={theme.tint}
            />
          }
        >
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

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4, marginBottom: 12 }}>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.glassBackground, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorderColor, gap: 6 }}
              onPress={() => {
                hapticMedium();
                const isWalk = sessionRadiusRef.current <= 1000;
                const nextRad = isWalk ? 8046 : DEFAULT_SEARCH_RADIUS_METERS;
                sessionRadiusRef.current = nextRad;
                setSession(s => (s ? { ...s, radiusMeters: nextRad } : s));
              }}
            >
              <Ionicons name={sessionRadiusRef.current <= 1000 ? "walk" : "car"} size={16} color={theme.accent} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                {sessionRadiusRef.current <= 1000 ? t('home.walk', { defaultValue: 'Walk' }) : t('home.drive', { defaultValue: 'Drive' })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.glassBackground, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorderColor, gap: 6 }}
              onPress={() => {
                hapticMedium();
                Image.clearMemoryCache();
                router.push('/scenarios' as any);
              }}
            >
              <Ionicons name="restaurant-outline" size={15} color={theme.accent} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('home.more', { defaultValue: 'More' })}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.subtext} />
            </TouchableOpacity>
          </View>
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
                renderItem={renderCarouselItem}
                removeClippedSubviews={false}
                initialNumToRender={5}
                maxToRenderPerBatch={5}
                windowSize={5}
                getItemLayout={(_, index) => ({
                  length: CAROUSEL_PAGE,
                  offset: CAROUSEL_PAGE * index,
                  index,
                })}
              />
              <View style={styles.dotsBar}>
                {visibleList.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => goToPick(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <AnimatedDot
                      active={i === pickIndex}
                      accentColor={theme.accent}
                      inactiveColor={rootNeon ? 'rgba(255,255,255,0.3)' : theme.cardBorderColor}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </>
  );

  return (
    <View style={[styles.background, { backgroundColor: theme.screenBackground ?? '#000000' }]}>
      {homeBody}
      <LaunchIntentSurvey />
    </View>
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
    marginTop: 52,
    marginBottom: 2,
    paddingHorizontal: 8,
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
  galleryBlock: { marginHorizontal: -20, flexGrow: 0, marginTop: 16, marginBottom: 5, overflow: 'visible' },
  carouselPage: {
    width: CAROUSEL_PAGE,
    paddingHorizontal: 10,
    overflow: 'visible',
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