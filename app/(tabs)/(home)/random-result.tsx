import { AiOverviewScoresPanel } from '@/components/AiOverviewScoresPanel';
import { NeonBorderCard } from '@/components/NeonBorderCard';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAppTheme } from '@/context/ThemeContext';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Linking, Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentRestaurant, subscribeCurrentRestaurant } from '../../../core/currentSelection';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '../../../core/images';
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

function InfoPill({
  icon,
  label,
  color,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  const c = color ?? theme.subtext;
  return (
    <View style={[styles.infoPill, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}>
      <Ionicons name={icon} size={13} color={c} />
      <Text style={[styles.infoPillText, { color: c }]}>{label}</Text>
    </View>
  );
}

function ThemedSection({
  children,
  theme,
  onPress,
}: {
  children: React.ReactNode;
  theme: ReturnType<typeof useAppTheme>['theme'];
  onPress?: () => void;
}) {
  const inner = (
    <View style={[styles.section, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

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
    <ThemedSection theme={theme}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} activeOpacity={0.8}>
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={16} color={theme.tint} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Opening Hours</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.subtext} />
        </View>
        {open && (
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
        )}
      </TouchableOpacity>
    </ThemedSection>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RandomResultScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  // Read the selected restaurant from memory — avoids the expensive JSON.parse
  // of a large URL param which was blocking the screen mount on every navigation.
  const [, setSelectionEpoch] = useState(0);
  useEffect(() => subscribeCurrentRestaurant(() => setSelectionEpoch(e => e + 1)), []);

  const place = getCurrentRestaurant() ?? {};

  const [liveOpenEpoch, setLiveOpenEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLiveOpenEpoch((e) => e + 1);
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
  const dist = `${formatDistance(distM)} away`;
  void liveOpenEpoch;
  const isOpen = isOpenNow(place);
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
  }, [place.id, place.displayName?.text, place.location?.latitude, place.location?.longitude, place.primaryType, place.websiteUri]);
  const aiOverview = place.aiOverview;
  const ph = !aiOverview;

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
    <LinearGradient colors={theme.gradient} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable
            style={[styles.iconBtn, { backgroundColor: theme.glassBackground }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </AnimatedPressable>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>Your Pick</Text>
          <TouchableOpacity onPress={handleShare} style={[styles.iconBtn, { backgroundColor: theme.glassBackground }]}>
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.bodyWrap}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: fabBottom + 72 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.text}
              onRefresh={() => {
                setRefreshing(true);
                setLiveOpenEpoch((e) => e + 1);
                setTimeout(() => setRefreshing(false), 300);
              }}
            />
          }
        >

          {/* Photo carousel */}
          <PhotoCarousel restaurantId={place.id || 'unknown'} photos={photos} />

          {/* Name + type badge */}
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
              {type ? <Text style={[styles.typeText, { color: theme.subtext }]}>{type}</Text> : null}
            </View>
            {price ? (
              <View style={[styles.pricePill, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}>
                <Text style={[styles.priceText, { color: theme.tint }]}>{price}</Text>
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
                theme={theme}
              />
            )}
            <InfoPill icon="navigate-outline" label={dist} color={theme.tint} theme={theme} />
            <InfoPill
              icon={isOpen ? 'checkmark-circle-outline' : 'close-circle-outline'}
              label={isOpen ? 'Open Now' : 'Closed'}
              color={isOpen ? '#4CD964' : '#FF6B6B'}
              theme={theme}
            />
          </View>

          <NeonBorderCard borderRadius={22} outerStyle={styles.mainCardOuter} innerStyle={styles.mainCardInner}>
            <AiOverviewScoresPanel
              ai={aiOverview}
              ph={ph}
              theme={theme}
              googleRating={place.rating}
              priceLevel={place.priceLevel}
            />
          </NeonBorderCard>

          {address ? (
            <ThemedSection theme={theme} onPress={copyAddress}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location-outline" size={16} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Address</Text>
                <Ionicons name="copy-outline" size={15} color={theme.subtext} />
              </View>
              <Text style={[styles.sectionBody, { color: theme.subtext }]}>{address}</Text>
              <Text style={[styles.copyHint, { color: theme.subtext }]}>
                {addressCopied ? 'Copied to clipboard' : 'Tap to copy'}
              </Text>
            </ThemedSection>
          ) : null}

          {phone ? (
            <ThemedSection theme={theme} onPress={() => Linking.openURL(`tel:${phone}`)}>
              <View style={styles.sectionHeader}>
                <Ionicons name="call-outline" size={16} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Phone</Text>
                <Ionicons name="open-outline" size={13} color={theme.subtext} />
              </View>
              <Text style={[styles.sectionBody, { color: theme.tint }]}>{phone}</Text>
            </ThemedSection>
          ) : null}

          {website ? (
            <ThemedSection theme={theme} onPress={() => Linking.openURL(website)}>
              <View style={styles.sectionHeader}>
                <Ionicons name="globe-outline" size={16} color={theme.tint} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Website</Text>
                <Ionicons name="open-outline" size={13} color={theme.subtext} />
              </View>
              <Text style={[styles.sectionBody, { color: theme.tint }]} numberOfLines={1}>
                {website}
              </Text>
            </ThemedSection>
          ) : null}

          <HoursSection weekdays={weekdays} theme={theme} />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.actionBtnSecondary,
                { backgroundColor: theme.buttonBackground, borderColor: theme.cardBorderColor },
              ]}
              onPress={() => router.push('/map' as any)}
            >
              <Ionicons name="map-outline" size={16} color={theme.tint} />
              <Text style={[styles.actionBtnText, { color: theme.tint }]}>Find on Local Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.actionBtnGhost,
                { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
              ]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="shuffle" size={16} color={theme.subtext} />
              <Text style={[styles.actionBtnText, { color: theme.subtext }]}>Pick Again</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        {mapsReady && (
          <TouchableOpacity
            style={[styles.mapsFabFixed, { bottom: fabBottom, backgroundColor: theme.accent }]}
            onPress={() => openGoogleMaps(name, lat!, lng!)}
            activeOpacity={0.88}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'map' : 'logo-google'}
              size={18}
              color={theme.matchOrbTextColor ?? '#FFFFFF'}
            />
            <View>
              <Text style={[styles.mapsFabTitle, { color: theme.matchOrbTextColor ?? '#FFFFFF' }]}>
                Open in {mapsProviderLabel}
              </Text>
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
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  mainCardOuter: { marginHorizontal: 16, marginBottom: 12 },
  mainCardInner: { padding: 12 },

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
  name: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  typeText: { fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
  pricePill: {
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
    marginTop: 4,
  },
  priceText: { fontSize: 14, fontWeight: '700' },

  // Pills row
  pillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, marginBottom: 16,
  },
  infoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1,
  },
  infoPillText: { fontSize: 13, fontWeight: '600' },

  section: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 18,
    padding: 16, borderWidth: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  sectionBody: { fontSize: 14, lineHeight: 20 },
  copyHint: { fontSize: 11, marginTop: 8, fontWeight: '600' },

  hoursList: { gap: 4 },
  hoursLine: { fontSize: 13, lineHeight: 20 },
  hoursLineToday: { fontWeight: '700' },

  // Action buttons
  actions: { marginHorizontal: 16, gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 14,
  },
  actionBtnSecondary: { borderWidth: 1 },
  actionBtnGhost: { borderWidth: 1 },
  actionBtnText: { fontSize: 15, fontWeight: '700' },
});
