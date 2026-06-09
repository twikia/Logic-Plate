import { AiOverviewSummaryBody } from '@/components/AiOverviewSummaryBody';
import { AiOverviewRadar } from '@/components/AiOverviewRadar';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { calculatePlateboundScore } from '@/core/ratingCalculator';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getCurrentRestaurant,
  setMapFocusRestaurant,
  subscribeCurrentRestaurant,
} from '../../../core/currentSelection';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openGoogleMaps(name: string, lat: number, lng: number) {
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

function scoreColor(s: number) {
  if (s >= 8) return '#4CD964';
  if (s >= 6.5) return '#FFD700';
  if (s >= 4.5) return '#FF9500';
  return '#FF6B6B';
}

// ─── Score arc gauge ──────────────────────────────────────────────────────────

type ThemeRef = ReturnType<typeof useAppTheme>['theme'];

const ARC_R = 42;
const ARC_CX = 60;
const ARC_CY = 58;
const ARC_LEN = Math.PI * ARC_R;

function ScoreGauge({ score, theme }: { score: number; theme: ThemeRef }) {
  const clamped = Math.min(10, Math.max(0, score));
  const dashFill = (clamped / 10) * ARC_LEN;
  const color = scoreColor(clamped);
  const d = `M ${ARC_CX - ARC_R} ${ARC_CY} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_CX + ARC_R} ${ARC_CY}`;
  return (
    <Svg width="100%" height={70} viewBox="0 0 120 70" preserveAspectRatio="xMidYMid meet">
      <Path d={d} stroke="rgba(255,255,255,0.08)" strokeWidth={11} fill="none" strokeLinecap="round" />
      <Path
        d={d}
        stroke={color}
        strokeWidth={11}
        fill="none"
        strokeDasharray={`${dashFill} ${ARC_LEN}`}
        strokeLinecap="round"
      />
      <SvgText
        x={ARC_CX} y={ARC_CY - 13}
        fill={theme.text} fontSize={21} fontWeight="800"
        textAnchor="middle" alignmentBaseline="middle"
      >
        {clamped.toFixed(1)}
      </SvgText>
      <SvgText
        x={ARC_CX} y={ARC_CY - 1}
        fill={theme.subtext} fontSize={8}
        textAnchor="middle" alignmentBaseline="middle"
      >
        out of 10
      </SvgText>
    </Svg>
  );
}

// ─── Metric chip ──────────────────────────────────────────────────────────────

function MetricChip({
  emoji, label, value, max = 5, theme,
}: {
  emoji: string;
  label: string;
  value: number | undefined;
  max?: 5 | 10;
  theme: ThemeRef;
}) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(1, n / max));
  const color = scoreColor((n / max) * 10);
  const displayVal = n % 1 === 0 ? `${n}` : n.toFixed(1);
  return (
    <View style={[styles.chip, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipLabel, { color: theme.subtext }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.chipValue, { color }]}>{displayVal}<Text style={[styles.chipMax, { color: theme.subtext }]}>/{max}</Text></Text>
      <View style={styles.chipTrack}>
        <View style={[styles.chipFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Contact row ──────────────────────────────────────────────────────────────

function ContactRow({
  icon, value, hint, theme, onPress, accentColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  hint?: string;
  theme: ThemeRef;
  onPress?: () => void;
  accentColor?: string;
}) {
  const tintColor = accentColor ?? theme.text;
  const row = (
    <View style={styles.contactRow}>
      <View style={[styles.contactIconBg, { backgroundColor: theme.tint + '22' }]}>
        <Ionicons name={icon} size={16} color={theme.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.contactValue, { color: tintColor }]} numberOfLines={2}>{value}</Text>
        {hint ? <Text style={[styles.contactHint, { color: theme.subtext }]}>{hint}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={13} color={theme.subtext} style={{ opacity: 0.6 }} /> : null}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.72}>{row}</TouchableOpacity>;
  return row;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RandomResultScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  const [, setSelectionEpoch] = useState(0);
  useEffect(() => subscribeCurrentRestaurant(() => setSelectionEpoch(e => e + 1)), []);

  const place = getCurrentRestaurant() ?? {};
  const [liveOpenEpoch, setLiveOpenEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, delay: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, delay: 180, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useFocusEffect(
    useCallback(() => { setLiveOpenEpoch(e => e + 1); }, [])
  );

  const name = place.displayName?.text || 'Unknown';
  const address = place.formattedAddress || '';
  const phone = place.nationalPhoneNumber || '';
  const website = place.websiteUri || '';
  const rating = place.rating;
  const reviews = place.userRatingCount;
  const price = formatPlacePriceLabel(place);
  const type = place.primaryType?.replace(/_/g, ' ') || '';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const { formatDistance } = useDistanceFormatter();
  const distM = Math.round(place.distanceMeters ?? 0);
  const dist = formatDistance(distM);
  void liveOpenEpoch;
  const isOpen = isOpenNow(place);
  const weekdays: string[] =
    place.currentOpeningHours?.weekdayDescriptions ??
    place.regularOpeningHours?.weekdayDescriptions ??
    [];
  const [addressCopied, setAddressCopied] = useState(false);
  const aiOverview = place.aiOverview;
  const ph = !aiOverview;
  const plateboundScore = !ph ? calculatePlateboundScore(aiOverview, place.rating, place.priceLevel) : null;

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out ${name}!\n${address}\n${website || ''}`, title: name });
    } catch { }
  };

  const mapsProviderLabel = Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps';
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const fabBottom = 4 + insets.bottom;

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const hasContact = !!(address || phone || website);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const pScore = plateboundScore ?? 0;
  const accentHex = scoreColor(pScore);
  const healthScore = aiOverview?.healthScore ?? 0;

  return (
    <LinearGradient colors={theme.gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <View style={styles.root}>

        {/* Fixed floating nav */}
        <View style={[styles.floatingHeader, { paddingTop: insets.top + 6 }]}>
          <AnimatedPressable style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </AnimatedPressable>
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare} activeOpacity={0.82}>
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: fabBottom + 82 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.text}
              onRefresh={() => {
                setRefreshing(true);
                setLiveOpenEpoch(e => e + 1);
                setTimeout(() => setRefreshing(false), 300);
              }}
            />
          }
        >
          {/* ─── Hero Card (data-driven, no image) ────────────────── */}
          <View style={[styles.heroCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
            {/* Score-colored top accent gradient */}
            <LinearGradient
              colors={[accentHex + '2E', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Badges row */}
            <View style={styles.badgeRow}>
              {type ? (
                <View style={[styles.typeBadge, { backgroundColor: theme.tint + '1E', borderColor: theme.tint + '55' }]}>
                  <Text style={[styles.typeBadgeText, { color: theme.tint }]}>{type}</Text>
                </View>
              ) : null}
              {price ? (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>{price}</Text>
                </View>
              ) : null}
              <View style={[
                styles.openBadge,
                { backgroundColor: isOpen ? '#4CD96422' : '#FF6B6B22', borderColor: isOpen ? '#4CD96466' : '#FF6B6B66' },
              ]}>
                <View style={[styles.openDot, { backgroundColor: isOpen ? '#4CD964' : '#FF6B6B' }]} />
                <Text style={[styles.openText, { color: isOpen ? '#4CD964' : '#FF6B6B' }]}>
                  {isOpen ? 'Open now' : 'Closed'}
                </Text>
              </View>
            </View>

            {/* Restaurant name */}
            <Text style={[styles.restaurantName, { color: theme.text }]} numberOfLines={3}>{name}</Text>

            {/* Rating + distance quick row */}
            <View style={styles.quickRow}>
              {typeof rating === 'number' && rating > 0 ? (
                <View style={styles.quickItem}>
                  <Ionicons name="star" size={13} color="#FFD700" />
                  <Text style={[styles.quickVal, { color: theme.text }]}>{rating.toFixed(1)}</Text>
                  {reviews ? (
                    <Text style={[styles.quickSub, { color: theme.subtext }]}>
                      {reviews >= 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews} reviews
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {typeof rating === 'number' && rating > 0 ? (
                <View style={[styles.quickDivider, { backgroundColor: theme.cardBorderColor }]} />
              ) : null}
              <View style={styles.quickItem}>
                <Ionicons name="navigate-outline" size={13} color={theme.tint} />
                <Text style={[styles.quickVal, { color: theme.text }]}>{dist}</Text>
              </View>
            </View>

            {/* Score panels */}
            {plateboundScore != null ? (
              <View style={[styles.scoreRow, { borderColor: theme.cardBorderColor, backgroundColor: theme.glassBackground }]}>
                {/* Platebound arc gauge */}
                <View style={styles.scoreHalf}>
                  <Text style={[styles.scoreLabel, { color: theme.subtext }]}>PLATEBOUND</Text>
                  <ScoreGauge score={plateboundScore} theme={theme} />
                  <Text style={[styles.scoreWord, { color: accentHex }]}>
                    {plateboundScore >= 8 ? 'Excellent' : plateboundScore >= 6.5 ? 'Great' : plateboundScore >= 4.5 ? 'Good' : 'Fair'}
                  </Text>
                </View>

                <View style={[styles.scoreDivider, { backgroundColor: theme.cardBorderColor }]} />

                {/* Health score */}
                <View style={styles.scoreHalf}>
                  <Text style={[styles.scoreLabel, { color: theme.subtext }]}>HEALTH</Text>
                  <View style={styles.healthNumRow}>
                    <Text style={[styles.healthBigNum, { color: '#4CD964' }]}>{healthScore.toFixed(1)}</Text>
                    <Text style={[styles.healthOutOf, { color: theme.subtext }]}>/10</Text>
                  </View>
                  <View style={[styles.healthTrack, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <View style={[styles.healthFill, { width: `${Math.min(100, (healthScore / 10) * 100)}%` }]} />
                  </View>
                  <Text style={[styles.healthWord, { color: theme.subtext }]}>
                    {healthScore >= 7 ? 'Nutritious' : healthScore >= 4 ? 'Moderate' : 'Indulgent'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ─── AI Summary ──────────────────────────────────────── */}
            {!ph ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="sparkles-outline" size={15} color="#C9A0FF" />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>AI Overview</Text>
                </View>
                <AiOverviewSummaryBody
                  text={aiOverview!.summaryGoodBad || 'No summary yet.'}
                  style={[styles.bodyText, { color: theme.subtext }]}
                />
              </View>
            ) : null}

            {/* ─── Radar + AI Metric Grid ───────────────────────────── */}
            {!ph ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="analytics-outline" size={15} color={theme.tint} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Performance</Text>
                </View>

                <AiOverviewRadar ai={aiOverview} theme={theme} height={180} neon={!!theme.neonColors} />

                <View style={styles.chipsGrid}>
                  <MetricChip emoji="👅" label="Taste" value={aiOverview?.tasteScore} max={5} theme={theme} />
                  <MetricChip emoji="💵" label="Value" value={aiOverview?.valueForMoneyScore} max={5} theme={theme} />
                  <MetricChip emoji="⚡" label="Speed" value={aiOverview?.speedScore} max={5} theme={theme} />
                  <MetricChip emoji="💪" label="Workout" value={aiOverview?.workoutRecoveryScore} max={10} theme={theme} />
                  <MetricChip emoji="🌙" label="Munchy" value={aiOverview?.munchyScore} max={5} theme={theme} />
                  <MetricChip emoji="🔥" label="Calories" value={aiOverview?.calorieScore} max={5} theme={theme} />
                  <MetricChip emoji="🥩" label="Protein" value={aiOverview?.proteinScore} max={5} theme={theme} />
                  <MetricChip emoji="💕" label="Date" value={aiOverview?.dateWorthiness} max={5} theme={theme} />
                  <MetricChip emoji="🪑" label="Solo" value={aiOverview?.soloDinerScore} max={5} theme={theme} />
                  <MetricChip emoji="🔋" label="Energy" value={aiOverview?.energySustainScore} max={5} theme={theme} />
                  <MetricChip emoji="💻" label="Work" value={aiOverview?.workFriendlyScore} max={5} theme={theme} />
                  <MetricChip emoji="🔄" label="Variety" value={aiOverview?.varietyScore} max={5} theme={theme} />
                </View>
              </View>
            ) : null}

            {/* ─── Who it's for + Macros ───────────────────────────── */}
            {!ph && (aiOverview?.whoThisPlaceIsFor || aiOverview?.absoluteMacros) ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                {aiOverview?.whoThisPlaceIsFor ? (
                  <>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardEmoji}>🎯</Text>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Who it's for</Text>
                    </View>
                    <Text style={[styles.bodyText, { color: theme.subtext }]}>{aiOverview.whoThisPlaceIsFor}</Text>
                  </>
                ) : null}
                {aiOverview?.whoThisPlaceIsFor && aiOverview?.absoluteMacros ? (
                  <View style={[styles.divider, { backgroundColor: theme.cardBorderColor }]} />
                ) : null}
                {aiOverview?.absoluteMacros ? (
                  <>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardEmoji}>🍽️</Text>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Typical macros</Text>
                    </View>
                    <Text style={[styles.bodyText, { color: theme.subtext }]}>{aiOverview.absoluteMacros}</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* ─── Contact ─────────────────────────────────────────── */}
            {hasContact ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                <Text style={[styles.sectionLabel, { color: theme.subtext }]}>CONTACT & LOCATION</Text>
                {address ? (
                  <ContactRow
                    icon="location-outline"
                    value={address}
                    hint={addressCopied ? '✓ Copied!' : 'Tap to copy'}
                    theme={theme}
                    onPress={copyAddress}
                  />
                ) : null}
                {address && (phone || website) ? (
                  <View style={[styles.divider, { backgroundColor: theme.cardBorderColor }]} />
                ) : null}
                {phone ? (
                  <ContactRow
                    icon="call-outline"
                    value={phone}
                    hint="Tap to call"
                    theme={theme}
                    onPress={() => Linking.openURL(`tel:${phone}`)}
                    accentColor={theme.tint}
                  />
                ) : null}
                {phone && website ? (
                  <View style={[styles.divider, { backgroundColor: theme.cardBorderColor }]} />
                ) : null}
                {website ? (
                  <ContactRow
                    icon="globe-outline"
                    value={website}
                    hint="Tap to open"
                    theme={theme}
                    onPress={() => Linking.openURL(website)}
                    accentColor={theme.tint}
                  />
                ) : null}
              </View>
            ) : null}

            {/* ─── Hours (always expanded) ─────────────────────────── */}
            {weekdays.length > 0 ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.contactIconBg, { backgroundColor: theme.tint + '22' }]}>
                    <Ionicons name="time-outline" size={15} color={theme.tint} />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Opening Hours</Text>
                </View>
                <View style={styles.hoursList}>
                  {weekdays.map((line, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.hoursLine,
                        { color: i === todayIndex ? '#4CD964' : theme.subtext },
                        i === todayIndex && styles.hoursLineToday,
                      ]}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {/* ─── Action buttons ───────────────────────────────────── */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                onPress={() => {
                  setMapFocusRestaurant(place);
                  router.push('/map' as any);
                }}
                activeOpacity={0.88}
              >
                <Ionicons name="map-outline" size={18} color={theme.matchOrbTextColor ?? '#FFFFFF'} />
                <Text style={[styles.primaryBtnText, { color: theme.matchOrbTextColor ?? '#FFFFFF' }]}>
                  Find on Local Map
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ghostBtn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Ionicons name="shuffle" size={18} color={theme.subtext} />
                <Text style={[styles.ghostBtnText, { color: theme.subtext }]}>Pick Again</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 24 }} />
          </Animated.View>
        </ScrollView>

        {/* Maps FAB */}
        {mapsReady ? (
          <TouchableOpacity
            style={[styles.mapsFab, { bottom: fabBottom, backgroundColor: theme.accent }]}
            onPress={() => openGoogleMaps(name, lat!, lng!)}
            activeOpacity={0.88}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
              size={18}
              color={theme.matchOrbTextColor ?? '#FFFFFF'}
            />
            <View>
              <Text style={[styles.fabTitle, { color: theme.matchOrbTextColor ?? '#FFFFFF' }]}>
                Open in {mapsProviderLabel}
              </Text>
              <Text style={styles.fabSub}>Directions</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1 },
  root: { flex: 1 },

  // Floating nav bar
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },

  // Hero card (replaces hero image)
  heroCard: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 22, borderWidth: 1,
    overflow: 'hidden', padding: 18,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeBadge: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  priceBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 4,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '800', color: '#F9A06F' },
  openBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 11, fontWeight: '700' },

  restaurantName: {
    fontSize: 30, fontWeight: '900', lineHeight: 36,
    marginBottom: 10,
  },

  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  quickItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quickDivider: { width: 1, height: 14 },
  quickVal: { fontSize: 14, fontWeight: '700' },
  quickSub: { fontSize: 12, fontWeight: '500' },

  // Score panels inside hero card
  scoreRow: {
    flexDirection: 'row', borderRadius: 16,
    borderWidth: 1, overflow: 'hidden', borderColor: 'transparent',
  },
  scoreHalf: {
    flex: 1, alignItems: 'center',
    paddingTop: 12, paddingBottom: 10, paddingHorizontal: 8,
  },
  scoreDivider: { width: 1, marginVertical: 14 },
  scoreLabel: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 2, textAlign: 'center',
  },
  scoreWord: { fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.3 },
  healthNumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 6, marginBottom: 8 },
  healthBigNum: { fontSize: 38, fontWeight: '900', lineHeight: 42 },
  healthOutOf: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  healthTrack: { height: 5, borderRadius: 3, overflow: 'hidden', width: '80%', marginBottom: 8 },
  healthFill: { height: '100%', borderRadius: 3, backgroundColor: '#4CD964' },
  healthWord: { fontSize: 11, fontWeight: '600' },

  // Generic content card
  card: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 18, padding: 16, borderWidth: 1, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardEmoji: { fontSize: 15 },
  bodyText: { fontSize: 14, lineHeight: 21 },
  sectionLabel: {
    fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 4,
  },

  // Metric chips (3-column grid)
  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    width: '31%',
    borderRadius: 12, borderWidth: 1,
    padding: 9, gap: 3,
  },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  chipValue: { fontSize: 12, fontWeight: '800' },
  chipMax: { fontSize: 10, fontWeight: '600' },
  chipTrack: {
    height: 3, borderRadius: 2, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 2,
  },
  chipFill: { height: '100%', borderRadius: 2 },

  // Contact
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 },
  contactIconBg: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  contactValue: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  contactHint: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  divider: { height: 1, marginVertical: 2, marginLeft: 44 },

  // Hours
  hoursList: { gap: 3 },
  hoursLine: { fontSize: 13, lineHeight: 20 },
  hoursLineToday: { fontWeight: '700' },

  // Action buttons
  actions: { marginHorizontal: 16, gap: 10, marginTop: 6 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 16, paddingVertical: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 8, elevation: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 16, paddingVertical: 14, borderWidth: 1,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '700' },

  // Maps FAB
  mapsFab: {
    position: 'absolute', right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14,
    maxWidth: '78%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 10,
    zIndex: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  fabTitle: { fontSize: 14, fontWeight: '800' },
  fabSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.72)', marginTop: 1 },
});
