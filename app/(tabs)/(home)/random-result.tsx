import { AiOverviewScoresPanel } from '@/components/AiOverviewScoresPanel';
import { NeonBorderCard } from '@/components/NeonBorderCard';
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
  Dimensions,
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
import { RestaurantImage, fetchRestaurantPhotoUrls } from '../../../core/images';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';

// ─── Constants ────────────────────────────────────────────────────────────────

const HERO_HEIGHT = 340;
const ARC_R = 42;
const ARC_CX = 60;
const ARC_CY = 58;
const ARC_LEN = Math.PI * ARC_R;

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

// ─── Hero Photo ───────────────────────────────────────────────────────────────

function HeroPhoto({ restaurantId, photos }: { restaurantId: string; photos: any[] }) {
  const screenWidth = Dimensions.get('window').width;
  const heroPhoto = (photos || [])[0];

  if (!heroPhoto) {
    return (
      <View style={[styles.photoEmpty, { height: HERO_HEIGHT }]}>
        <Ionicons name="restaurant-outline" size={64} color="rgba(255,255,255,0.10)" />
      </View>
    );
  }

  return (
    <RestaurantImage
      restaurantId={restaurantId}
      photos={[heroPhoto]}
      width={screenWidth}
      height={HERO_HEIGHT}
      quality={800}
      loadDelay={100}
    />
  );
}

// ─── Score Arc Gauge ──────────────────────────────────────────────────────────

function ScoreGauge({
  score,
  theme,
}: {
  score: number;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  const clamped = Math.min(10, Math.max(0, score));
  const dashFill = (clamped / 10) * ARC_LEN;
  const color = scoreColor(clamped);
  const d = `M ${ARC_CX - ARC_R} ${ARC_CY} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_CX + ARC_R} ${ARC_CY}`;

  return (
    <Svg width="100%" height={70} viewBox="0 0 120 70" preserveAspectRatio="xMidYMid meet">
      <Path
        d={d}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={11}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d={d}
        stroke={color}
        strokeWidth={11}
        fill="none"
        strokeDasharray={`${dashFill} ${ARC_LEN}`}
        strokeLinecap="round"
      />
      <SvgText
        x={ARC_CX}
        y={ARC_CY - 13}
        fill={theme.text}
        fontSize={21}
        fontWeight="800"
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {clamped.toFixed(1)}
      </SvgText>
      <SvgText
        x={ARC_CX}
        y={ARC_CY - 1}
        fill={theme.subtext}
        fontSize={8}
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        out of 10
      </SvgText>
    </Svg>
  );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon,
  value,
  label,
  color,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
  color: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}>
      <View style={[styles.statIconBg, { backgroundColor: color + '28' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.subtext }]}>{label}</Text>
    </View>
  );
}

// ─── Contact Row ──────────────────────────────────────────────────────────────

function ContactRow({
  icon,
  value,
  hint,
  theme,
  onPress,
  accentColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  hint?: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
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
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.72}>{row}</TouchableOpacity>;
  }
  return row;
}

// ─── Hours Section ────────────────────────────────────────────────────────────

function HoursSection({
  weekdays,
  theme,
}: {
  weekdays: string[];
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  const [open, setOpen] = useState(false);
  if (!weekdays?.length) return null;
  const today = new Date().getDay();
  const todayIndex = (today + 6) % 7;

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
      <TouchableOpacity onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
        <View style={styles.cardRow}>
          <View style={[styles.contactIconBg, { backgroundColor: theme.tint + '22' }]}>
            <Ionicons name="time-outline" size={16} color={theme.tint} />
          </View>
          <Text style={[styles.cardRowLabel, { color: theme.text }]}>Opening Hours</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.subtext} />
        </View>
        {open ? (
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
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

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
    useCallback(() => {
      setLiveOpenEpoch(e => e + 1);
    }, [])
  );

  const name = place.displayName?.text || 'Unknown';
  const address = place.formattedAddress || '';
  const phone = place.nationalPhoneNumber || '';
  const website = place.websiteUri || '';
  const rating = place.rating?.toFixed(1);
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
  const weekdays =
    place.currentOpeningHours?.weekdayDescriptions ??
    place.regularOpeningHours?.weekdayDescriptions ??
    [];
  const [photos, setPhotos] = useState<any[]>(place.photos || []);
  const [addressCopied, setAddressCopied] = useState(false);
  const aiOverview = place.aiOverview;
  const ph = !aiOverview;
  const plateboundScore =
    !ph ? calculatePlateboundScore(aiOverview, place.rating, place.priceLevel) : null;

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      const placeId = place.id;
      const placeName = place.displayName?.text;
      const placeLat = place.location?.latitude;
      const placeLng = place.location?.longitude;

      if (!placeId || !placeName || typeof placeLat !== 'number' || typeof placeLng !== 'number') return;

      const photoUrls = await fetchRestaurantPhotoUrls({
        placeId,
        name: placeName,
        latitude: placeLat,
        longitude: placeLng,
        websiteUrl: place.websiteUri || undefined,
        cuisineKey: place.primaryType?.replace(/_restaurant$/, '') || undefined,
      });

      if (cancelled || photoUrls.length === 0) return;
      setPhotos(photoUrls.slice(0, 1));
    };

    loadPhotos();
    return () => { cancelled = true; };
  }, [place.id, place.displayName?.text, place.location?.latitude, place.location?.longitude, place.primaryType, place.websiteUri]);

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

  return (
    <LinearGradient colors={theme.gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <View style={styles.root}>

        {/* Floating header — overlays hero */}
        <View style={[styles.floatingHeader, { paddingTop: insets.top + 6 }]}>
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </AnimatedPressable>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleShare}
            activeOpacity={0.82}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: fabBottom + 82 }}
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
          {/* ─── Hero ─────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <HeroPhoto restaurantId={place.id || 'unknown'} photos={photos} />

            {/* Gradient fade — transparent → background color */}
            <LinearGradient
              colors={['transparent', theme.gradient[0]]}
              style={styles.heroOverlay}
              pointerEvents="none"
            />

            {/* Name + type/price overlaid on gradient */}
            <View style={styles.heroInfo}>
              <View style={styles.heroBadgeRow}>
                {type ? (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{type}</Text>
                  </View>
                ) : null}
                {price ? (
                  <View style={[styles.priceBadge, { borderColor: theme.tint + '99' }]}>
                    <Text style={[styles.priceBadgeText, { color: theme.tint }]}>{price}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.heroName} numberOfLines={2}>{name}</Text>
            </View>
          </View>

          {/* ─── Animated content below hero ─────────────────────────────── */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* Score card — only when AI data is available */}
            {plateboundScore != null && !ph ? (
              <View style={[styles.scoreCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                {/* Left: Platebound arc gauge */}
                <View style={styles.scoreLeft}>
                  <Text style={[styles.scoreSectionLabel, { color: theme.subtext }]}>Platebound Score</Text>
                  <ScoreGauge score={plateboundScore} theme={theme} />
                  <Text style={[styles.scoreBadgeText, { color: scoreColor(plateboundScore) }]}>
                    {plateboundScore >= 8 ? 'Excellent' : plateboundScore >= 6.5 ? 'Great' : plateboundScore >= 4.5 ? 'Good' : 'Fair'}
                  </Text>
                </View>

                <View style={[styles.scoreVerticalDivider, { backgroundColor: theme.cardBorderColor }]} />

                {/* Right: Health + Google rating */}
                <View style={styles.scoreRight}>
                  <Text style={[styles.scoreSectionLabel, { color: theme.subtext }]}>Health Score</Text>
                  <View style={styles.healthNumberRow}>
                    <Text style={[styles.healthBigNum, { color: '#4CD964' }]}>
                      {(aiOverview?.healthScore ?? 0).toFixed(1)}
                    </Text>
                    <Text style={[styles.healthOutOf, { color: theme.subtext }]}>/10</Text>
                  </View>
                  <View style={[styles.healthBarTrack, { backgroundColor: theme.glassBackground }]}>
                    <View
                      style={[
                        styles.healthBarFill,
                        { width: `${Math.min(100, ((aiOverview?.healthScore ?? 0) / 10) * 100)}%` },
                      ]}
                    />
                  </View>

                  {/* Google rating */}
                  {rating ? (
                    <View style={styles.googleRow}>
                      <View style={[styles.googleIconBg, { backgroundColor: '#FFD70022' }]}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                      </View>
                      <View>
                        <Text style={[styles.googleRatingNum, { color: theme.text }]}>{rating}</Text>
                        {reviews ? (
                          <Text style={[styles.googleReviews, { color: theme.subtext }]}>
                            {reviews.toLocaleString()} reviews
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Stats row */}
            <View style={styles.statsRow}>
              {rating ? (
                <StatTile icon="star" value={rating} label="Rating" color="#FFD700" theme={theme} />
              ) : null}
              <StatTile icon="navigate-outline" value={dist} label="Distance" color={theme.tint} theme={theme} />
              <StatTile
                icon={isOpen ? 'checkmark-circle-outline' : 'close-circle-outline'}
                value={isOpen ? 'Open' : 'Closed'}
                label="Status"
                color={isOpen ? '#4CD964' : '#FF6B6B'}
                theme={theme}
              />
              {price ? (
                <StatTile icon="pricetag-outline" value={price} label="Price" color={theme.tint} theme={theme} />
              ) : null}
            </View>

            {/* AI scores panel */}
            <NeonBorderCard borderRadius={22} outerStyle={styles.aiCardOuter} innerStyle={styles.aiCardInner}>
              <AiOverviewScoresPanel
                ai={aiOverview}
                ph={ph}
                theme={theme}
                googleRating={place.rating}
                priceLevel={place.priceLevel}
              />
            </NeonBorderCard>

            {/* Contact card */}
            {hasContact ? (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
                <Text style={[styles.cardSectionLabel, { color: theme.subtext }]}>CONTACT & LOCATION</Text>
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

            <HoursSection weekdays={weekdays} theme={theme} />

            {/* Action buttons */}
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

  // Floating header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  // Hero
  hero: { position: 'relative' },
  photoEmpty: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    pointerEvents: 'none',
  },
  heroInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  typeBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  priceBadge: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroName: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  // Score card
  scoreCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  scoreLeft: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  scoreVerticalDivider: {
    width: 1,
    marginVertical: 14,
  },
  scoreRight: {
    flex: 1,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  scoreSectionLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
    textAlign: 'center',
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  healthNumberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 6,
    marginBottom: 8,
  },
  healthBigNum: {
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
  },
  healthOutOf: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  healthBarTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#4CD964',
  },
  googleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  googleIconBg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleRatingNum: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 17,
  },
  googleReviews: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  statTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  statIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // AI panel
  aiCardOuter: { marginHorizontal: 16, marginBottom: 10 },
  aiCardInner: { padding: 12 },

  // Generic card
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  cardSectionLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardRowLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 3,
  },
  contactIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  contactHint: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 10,
    marginLeft: 44,
  },

  // Hours
  hoursList: { gap: 3, marginTop: 12, paddingLeft: 44 },
  hoursLine: { fontSize: 13, lineHeight: 20 },
  hoursLineToday: { fontWeight: '700' },

  // Actions
  actions: { marginHorizontal: 16, gap: 10, marginTop: 6 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // FAB
  mapsFab: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: '78%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fabTitle: { fontSize: 14, fontWeight: '800' },
  fabSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.72)', marginTop: 1 },
});
