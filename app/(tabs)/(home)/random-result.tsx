import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Linking, Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '../../../core/images';

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

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

// ─── Photo carousel (uses decoupled RestaurantImage) ────────────────────────────────────

function PhotoCarousel({ restaurantId, photos }: { restaurantId: string; photos: any[] }) {
  const [active, setActive] = useState(0);
  const screenWidth = Dimensions.get('window').width;
  // Show up to 4 slides — matches our three-tier TARGET_PHOTOS count
  const slideCount = Math.min(4, (photos || []).length);

  if (!slideCount) {
    return (
      <View style={styles.photoEmpty}>
        <Ionicons name="restaurant-outline" size={48} color="rgba(255,255,255,0.15)" />
      </View>
    );
  }

  return (
    <View style={styles.carouselWrap}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
          setActive(idx);
        }}
      >
        {Array.from({ length: slideCount }, (_, i) => {
          // Each slide gets a single photo — RestaurantImage handles fallback internally
          const slidePhoto = photos[i] ? [photos[i]] : [];
          return (
            <RestaurantImage
              key={`${restaurantId}_slide_${i}`}
              restaurantId={`${restaurantId}_slide_${i}`}
              photos={slidePhoto}
              width={screenWidth}
              height={240}
              quality={800}
              loadDelay={i === 0 ? 100 : 300}
            />
          );
        })}
      </ScrollView>
      {/* Dots */}
      <View style={styles.dotRow}>
        {Array.from({ length: slideCount }, (_, i) => (
          <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// ─── Info Pill ────────────────────────────────────────────────────────────────

function InfoPill({ icon, label, color = 'rgba(255,255,255,0.65)' }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.infoPill}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.infoPillText, { color }]}>{label}</Text>
    </View>
  );
}

function TenPointBar({
  label,
  value,
  icon,
  emoji,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  emoji: string;
}) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(1, v / 10));
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreCardTop}>
        <Text style={styles.scoreEmoji}>{emoji}</Text>
        <Ionicons name={icon} size={15} color="#F9A06F" />
        <Text style={styles.scoreCardLabel}>{label}</Text>
        <Text style={styles.scoreCardVal}>{v.toFixed(1)}/10</Text>
      </View>
      <View style={styles.tenTrack}>
        <View style={[styles.tenFill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

function FiveStarRow({ label, value, emoji }: { label: string; value: number | undefined; emoji: string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(typeof value === 'number' && Number.isFinite(value) ? value : 0)));
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreCardTop}>
        <Text style={styles.scoreEmoji}>{emoji}</Text>
        <Text style={styles.scoreCardLabel}>{label}</Text>
        <View style={styles.scoreStars}>
          {Array.from({ length: 5 }, (_, i) => (
            <Ionicons key={i} name={i < rounded ? 'star' : 'star-outline'} size={15} color="#FFD66B" />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Hours Section ────────────────────────────────────────────────────────────

function HoursSection({ weekdays }: { weekdays: string[] }) {
  const [open, setOpen] = useState(false);
  if (!weekdays?.length) return null;
  const today = new Date().getDay(); // 0=Sun … 6=Sat → weekdays[0] = Monday
  const todayIndex = (today + 6) % 7; // convert to Mon=0 index

  return (
    <TouchableOpacity style={styles.section} onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
      <View style={styles.sectionHeader}>
        <Ionicons name="time-outline" size={16} color="#F9A06F" />
        <Text style={styles.sectionTitle}>Opening Hours</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.4)" />
      </View>
      {open && (
        <View style={styles.hoursList}>
          {weekdays.map((line, i) => (
            <Text
              key={i}
              style={[styles.hoursLine, i === todayIndex && styles.hoursLineToday]}
            >
              {line}
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RandomResultScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Read the selected restaurant from memory — avoids the expensive JSON.parse
  // of a large URL param which was blocking the screen mount on every navigation.
  const place = getCurrentRestaurant() ?? {};

  const name = place.displayName?.text || 'Unknown';
  const address = place.formattedAddress || '';
  const phone = place.nationalPhoneNumber || '';
  const website = place.websiteUri || '';
  const rating = place.rating?.toFixed(1);
  const reviews = place.userRatingCount;
  const price = PRICE_MAP[place.priceLevel] || '';
  const type = place.primaryType?.replace(/_/g, ' ') || '';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const { formatDistance } = useDistanceFormatter();
  const distM = Math.round(place.distanceMeters ?? 0);
  const dist = `${formatDistance(distM)} away`;
  const isOpen = place.currentOpeningHours?.openNow ?? place.businessStatus === 'OPERATIONAL';
  const weekdays = place.currentOpeningHours?.weekdayDescriptions
    ?? place.regularOpeningHours?.weekdayDescriptions
    ?? [];
  const [photos, setPhotos] = useState<any[]>(place.photos || []);
  const [addressCopied, setAddressCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      const placeId   = place.id;
      const placeName = place.displayName?.text;
      const placeLat  = place.location?.latitude;
      const placeLng  = place.location?.longitude;

      if (!placeId || !placeName || typeof placeLat !== 'number' || typeof placeLng !== 'number') return;

      const photoUrls = await fetchRestaurantPhotoUrls({
        placeId,
        name:       placeName,
        latitude:   placeLat,
        longitude:  placeLng,
        websiteUrl: place.websiteUri || undefined,
        cuisineKey: place.primaryType?.replace(/_restaurant$/, '') || undefined,
      });

      if (cancelled || photoUrls.length === 0) return;

      setPhotos(photoUrls);
    };

    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [place.id, place.displayName?.text, place.location?.latitude, place.location?.longitude]);
  const aiOverview = place.aiOverview;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${name}!\n${address}\n${website || ''}`,
        title: name,
      });
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

  return (
    <LinearGradient colors={['#422046', '#FF9A6F']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </AnimatedPressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Your Pick</Text>
          <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.bodyWrap}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: fabBottom + 72 }]}
        >

          {/* Photo carousel */}
          <PhotoCarousel restaurantId={place.id || 'unknown'} photos={photos} />

          {/* Name + type badge */}
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{name}</Text>
              {type ? <Text style={styles.typeText}>{type}</Text> : null}
            </View>
            {price ? (
              <View style={styles.pricePill}>
                <Text style={styles.priceText}>{price}</Text>
              </View>
            ) : null}
          </View>

          {/* Quick pills */}
          <View style={styles.pillRow}>
            {rating && (
              <InfoPill
                icon="star"
                label={`${rating}${reviews ? `  (${reviews.toLocaleString()})` : ''}`}
                color="#FFD700"
              />
            )}
            <InfoPill icon="navigate-outline" label={dist} color="#F9A06F" />
            <InfoPill
              icon={isOpen ? 'checkmark-circle-outline' : 'close-circle-outline'}
              label={isOpen ? 'Open Now' : 'Closed'}
              color={isOpen ? '#4CD964' : '#FF6B6B'}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart-outline" size={16} color="#A8D5A2" />
              <Text style={[styles.sectionTitle, { color: '#A8D5A2' }]}>Health score</Text>
              <Text style={styles.healthScoreBadge}>
                {typeof aiOverview?.healthScore === 'number' ? `${aiOverview.healthScore.toFixed(1)}/10` : 'Pending'}
              </Text>
            </View>
            <View style={styles.healthBar}>
              <View style={[styles.healthFill, { width: `${((aiOverview?.healthScore ?? 0) / 10) * 100}%` }]} />
            </View>
          </View>

          {/* Address */}
          {address ? (
            <TouchableOpacity style={styles.section} onPress={copyAddress} activeOpacity={0.85}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location-outline" size={16} color="#F9A06F" />
                <Text style={styles.sectionTitle}>Address</Text>
                <Ionicons name="copy-outline" size={15} color="rgba(255,255,255,0.45)" />
              </View>
              <Text style={styles.sectionBody}>{address}</Text>
              <Text style={styles.copyHint}>{addressCopied ? 'Copied to clipboard' : 'Tap to copy'}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Phone */}
          {phone ? (
            <TouchableOpacity
              style={styles.section}
              onPress={() => Linking.openURL(`tel:${phone}`)}
            >
              <View style={styles.sectionHeader}>
                <Ionicons name="call-outline" size={16} color="#F9A06F" />
                <Text style={styles.sectionTitle}>Phone</Text>
                <Ionicons name="open-outline" size={13} color="rgba(255,255,255,0.35)" />
              </View>
              <Text style={[styles.sectionBody, { color: '#F9A06F' }]}>{phone}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Website */}
          {website ? (
            <TouchableOpacity
              style={styles.section}
              onPress={() => Linking.openURL(website)}
            >
              <View style={styles.sectionHeader}>
                <Ionicons name="globe-outline" size={16} color="#F9A06F" />
                <Text style={styles.sectionTitle}>Website</Text>
                <Ionicons name="open-outline" size={13} color="rgba(255,255,255,0.35)" />
              </View>
              <Text style={[styles.sectionBody, { color: '#F9A06F' }]} numberOfLines={1}>{website}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Opening hours */}
          <HoursSection weekdays={weekdays} />

          {aiOverview ? (
            <>
              <View style={[styles.section, styles.aiSection]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="sparkles-outline" size={16} color="#C9A0FF" />
                  <Text style={[styles.sectionTitle, { color: '#C9A0FF' }]}>AI overview</Text>
                </View>
                <Text style={styles.sectionBody}>{aiOverview.summaryGoodBad || 'No summary yet.'}</Text>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.aiSparkle}>⚡</Text>
                  <Ionicons name="flash-outline" size={16} color="#F9A06F" />
                  <Text style={styles.sectionTitle}>Pace & recovery</Text>
                </View>
                <View style={styles.scoreCardStack}>
                  <TenPointBar label="Speed" value={aiOverview.speedScore} icon="timer-outline" emoji="⏱️" />
                  <TenPointBar label="Workout recovery" value={aiOverview.workoutRecoveryScore} icon="barbell-outline" emoji="💪" />
                  <TenPointBar label="Processed food load" value={aiOverview.processedScore} icon="nutrition-outline" emoji="🍎" />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.aiSparkle}>🍽️</Text>
                  <Ionicons name="restaurant-outline" size={16} color="#FFD66B" />
                  <Text style={styles.sectionTitle}>Nutrition & portions</Text>
                </View>
                <View style={styles.scoreCardStack}>
                  <FiveStarRow label="Calorie fit" value={aiOverview.calorieScore} emoji="🔥" />
                  <FiveStarRow label="Protein" value={aiOverview.proteinScore} emoji="🥩" />
                  <FiveStarRow label="Carb balance" value={aiOverview.carbScore} emoji="🌾" />
                </View>
                {aiOverview.absoluteMacros ? (
                  <Text style={styles.macrosBlock}>{aiOverview.absoluteMacros}</Text>
                ) : null}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.aiSparkle}>💫</Text>
                  <Ionicons name="people-outline" size={16} color="#E9A0C8" />
                  <Text style={styles.sectionTitle}>Vibe & social</Text>
                </View>
                <View style={styles.scoreCardStack}>
                  <FiveStarRow label="Date worthiness" value={aiOverview.dateWorthiness} emoji="💕" />
                  <FiveStarRow label="Noise level" value={aiOverview.noiseLevelEstimate} emoji="🔊" />
                  <View style={styles.scoreCard}>
                    <View style={styles.scoreCardTop}>
                      <Text style={styles.scoreEmoji}>👥</Text>
                      <Ionicons name="people-circle-outline" size={15} color="#F9A06F" />
                      <Text style={styles.scoreCardLabel}>Group sweet spot</Text>
                      <Text style={styles.scoreCardVal}>
                        {aiOverview.groupSizeSweetSpot != null ? `${aiOverview.groupSizeSweetSpot} people` : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {aiOverview.whoThisPlaceIsFor ? (
                <View style={[styles.section, styles.whoSection]}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.aiSparkle}>🎯</Text>
                    <Ionicons name="person-outline" size={16} color="#B8E0FF" />
                    <Text style={[styles.sectionTitle, { color: '#B8E0FF' }]}>Who is this place for?</Text>
                  </View>
                  <Text style={styles.sectionBody}>{aiOverview.whoThisPlaceIsFor}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={[styles.section, styles.aiSection]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles-outline" size={16} color="#C9A0FF" />
                <Text style={[styles.sectionTitle, { color: '#C9A0FF' }]}>AI overview</Text>
              </View>
              <Text style={styles.sectionBody}>Generating AI overview...</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() => router.push('/map' as any)}
            >
              <Ionicons name="map-outline" size={16} color="#F97352" />
              <Text style={[styles.actionBtnText, { color: '#F97352' }]}>Find on Local Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnGhost]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="shuffle" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={[styles.actionBtnText, { color: 'rgba(255,255,255,0.6)' }]}>Pick Again</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        {mapsReady && (
          <TouchableOpacity
            style={[styles.mapsFabFixed, { bottom: fabBottom }]}
            onPress={() => openGoogleMaps(name, lat!, lng!)}
            activeOpacity={0.88}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
              size={18}
              color="#FFFFFF"
            />
            <View>
              <Text style={styles.mapsFabTitle}>Open in {mapsProviderLabel}</Text>
              <Text style={styles.mapsFabSub}>Directions</Text>
            </View>
          </TouchableOpacity>
        )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  bodyWrap: { flex: 1 },
  scroll: { paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', flex: 1, textAlign: 'center', marginHorizontal: 8 },

  // Carousel
  carouselWrap: { position: 'relative' },
  carouselImage: { width: '100%', height: 240 },
  photoEmpty: {
    height: 200, backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  dotRow: {
    position: 'absolute', bottom: 10,
    flexDirection: 'row', alignSelf: 'center', gap: 5,
  },
  mapsFabFixed: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F97352',
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
  mapsFabTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  mapsFabSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#FFFFFF', width: 16 },

  // Name block
  nameRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, gap: 10,
  },
  name: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', lineHeight: 32 },
  typeText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, textTransform: 'capitalize' },
  pricePill: {
    backgroundColor: 'rgba(249,163,111,0.2)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(249,163,111,0.4)',
    marginTop: 4,
  },
  priceText: { fontSize: 14, fontWeight: '700', color: '#F9A06F' },

  // Pills row
  pillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, marginBottom: 16,
  },
  infoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  infoPillText: { fontSize: 13, fontWeight: '600' },

  // Generic section
  section: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(30,15,30,0.55)', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  sectionBody: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 20 },
  copyHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontWeight: '600' },
  healthScoreBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A8D5A2',
  },

  // Hours
  hoursList: { gap: 4 },
  hoursLine: { fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 20 },
  hoursLineToday: { color: '#4CD964', fontWeight: '700' },

  // AI section
  aiSection: { borderColor: 'rgba(201,160,255,0.15)' },
  aiSparkle: { fontSize: 15, marginRight: -2 },
  whoSection: { borderColor: 'rgba(184,224,255,0.25)' },
  scoreCardStack: { gap: 10 },
  scoreCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scoreCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  scoreEmoji: { fontSize: 16 },
  scoreCardLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.88)', minWidth: 120 },
  scoreCardVal: { fontSize: 12, fontWeight: '800', color: '#F9A06F' },
  scoreStars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tenTrack: {
    height: 7,
    marginTop: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  tenFill: { height: '100%', borderRadius: 4, backgroundColor: '#68D8A3' },
  macrosBlock: {
    marginTop: 12,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    fontWeight: '600',
  },

  // Health bar
  healthBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  healthFill: { height: '100%', backgroundColor: '#4CD964', borderRadius: 3 },

  // Action buttons
  actions: { marginHorizontal: 16, gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 14,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(249,115,82,0.1)',
    borderWidth: 1, borderColor: 'rgba(249,115,82,0.4)',
  },
  actionBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
