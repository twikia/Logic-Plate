import { AiOverviewSummaryBody } from '@/components/AiOverviewSummaryBody';
import { TranslatedText } from '@/components/ui/TranslatedText';
import { NeonAmbientGlow } from '@/components/ui/NeonAmbientGlow';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import {
  NUTRITION_METRICS,
  PERFORMANCE_METRICS,
  sortMetricsByScore,
  VibeStatsPodium,
} from '@/components/VibeStatsPodium';
import { calculatePlateboundScore } from '@/core/ratingCalculator';
import { RestaurantImage, fetchRestaurantPhotoUrls } from '@/core/images';
import { fetchAiMenu } from '@/core/menuCache';
import { useAppTheme } from '@/context/ThemeContext';
import { formatWeekdayHours } from '@/core/i18nLabels';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { usePersistedAccordion } from '@/hooks/usePersistedAccordion';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  Dimensions,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReAnimated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getCurrentRestaurant,
  setMapFocusRestaurant,
  subscribeCurrentRestaurant,
} from '../../../core/currentSelection';
import { isOpenNow } from '../../../core/isOpenNow';
import { formatPlacePriceLabel } from '../../../core/placePriceLabel';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = 340;

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

type ThemeRef = ReturnType<typeof useAppTheme>['theme'];

const ORB_R = 38;
const ORB_C = 2 * Math.PI * ORB_R;

function OrbitalGauge({
  score,
  max = 10,
  ringColor,
  theme,
  centerText,
  centerSub,
  label,
}: {
  score: number;
  max?: number;
  ringColor: string;
  theme: ThemeRef;
  centerText: string;
  centerSub?: string;
  label: string;
}) {
  const clamped = Math.min(max, Math.max(0, score));
  const fill = (clamped / max) * ORB_C;
  return (
    <View style={styles.orbWrap}>
      <Svg width={96} height={96} viewBox="0 0 96 96">
        <G rotation={-90} origin="48, 48">
          <Circle
            cx={48}
            cy={48}
            r={ORB_R}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={7}
            fill="none"
          />
          <Circle
            cx={48}
            cy={48}
            r={ORB_R}
            stroke={ringColor}
            strokeWidth={7}
            fill="none"
            strokeDasharray={`${fill} ${ORB_C}`}
            strokeLinecap="round"
          />
        </G>
        <SvgText
          x={48}
          y={centerSub ? 40 : 44}
          fill={theme.text}
          fontSize={centerSub ? 11 : 18}
          fontWeight="800"
          textAnchor="middle"
        >
          {centerText}
        </SvgText>
        {centerSub ? (
          <SvgText
            x={48}
            y={52}
            fill={theme.subtext}
            fontSize={10}
            fontWeight="600"
            textAnchor="middle"
          >
            {centerSub}
          </SvgText>
        ) : null}
      </Svg>
      <Text style={[styles.orbLabel, { color: theme.subtext }]}>{label}</Text>
    </View>
  );
}

function MetricChip({
  emoji,
  label,
  value,
  max = 5,
  theme,
  detail,
}: {
  emoji: string;
  label: string;
  value: number | undefined;
  max?: 5 | 10;
  theme: ThemeRef;
  detail?: string;
}) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(1, n / max));
  const color = scoreColor((n / max) * 10);
  const displayVal = n % 1 === 0 ? `${n}` : n.toFixed(1);
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
      ]}
    >
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipLabel, { color: theme.subtext }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? (
        <Text style={[styles.chipDetail, { color: theme.text }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      <Text style={[styles.chipValue, { color }]}>
        {displayVal}
        <Text style={[styles.chipMax, { color: theme.subtext }]}>/{max}</Text>
      </Text>
      <View style={styles.chipTrack}>
        <View style={[styles.chipFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SectionCard({
  title,
  icon,
  theme,
  children,
  accordionKey,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  theme: ThemeRef;
  children: React.ReactNode;
  accordionKey?: string;
  defaultExpanded?: boolean;
}) {
  const { isExpanded, toggle } = usePersistedAccordion(accordionKey || title, defaultExpanded);

  return (
    <View
      style={[
        styles.drawer,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor },
      ]}
    >
      <TouchableOpacity onPress={accordionKey ? toggle : undefined} style={styles.drawerHeader} activeOpacity={0.7} animated={false} disabled={!accordionKey}>
        <View style={[styles.drawerIconBg, { backgroundColor: theme.tint + '22' }]}>
          <Ionicons name={icon} size={15} color={theme.tint} />
        </View>
        <View style={styles.drawerHeaderText}>
          <Text style={[styles.drawerTitle, { color: theme.text }]}>{title}</Text>
        </View>
        {accordionKey ? (
          <Ionicons 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            size={18} 
            color={theme.subtext} 
          />
        ) : null}
      </TouchableOpacity>
      {(!accordionKey || isExpanded) ? (
        <View style={styles.drawerBody}>{children}</View>
      ) : null}
    </View>
  );
}

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
        <Text style={[styles.contactValue, { color: tintColor }]} numberOfLines={2}>
          {value}
        </Text>
        {hint ? (
          <Text style={[styles.contactHint, { color: theme.subtext }]}>{hint}</Text>
        ) : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={13} color={theme.subtext} style={{ opacity: 0.6 }} />
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.72} animated={false}>
        {row}
      </TouchableOpacity>
    );
  }
  return row;
}

type MacroPill = { emoji: string; labelKey: 'protein' | 'carbs' | 'fats'; value: string };

function parseMacroPills(text: string): MacroPill[] {
  const patterns: { emoji: string; labelKey: MacroPill['labelKey']; regex: RegExp }[] = [
    { emoji: '🥩', labelKey: 'protein', regex: /protein[:\s]*(\d+)\s*g/i },
    { emoji: '🍞', labelKey: 'carbs', regex: /carb(?:s|ohydrate)?[:\s]*(\d+)\s*g/i },
    { emoji: '🥑', labelKey: 'fats', regex: /fat[s]?[:\s]*(\d+)\s*g/i },
  ];
  const pills: MacroPill[] = [];
  for (const { emoji, labelKey, regex } of patterns) {
    const m = text.match(regex);
    if (m) pills.push({ emoji, labelKey, value: m[1] + 'g' });
  }
  return pills;
}

export default function RandomResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { t } = useTranslation();

  const [, setSelectionEpoch] = useState(0);
  useEffect(() => subscribeCurrentRestaurant(() => setSelectionEpoch(e => e + 1)), []);

  const place = getCurrentRestaurant() ?? {};
  const [liveOpenEpoch, setLiveOpenEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [heroPhotos, setHeroPhotos] = useState<any[]>(place.photos || []);
  const [menuItems, setMenuItems] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { setLiveOpenEpoch(e => e + 1); }, []));

  const name = place.displayName?.text || t('common.unknown');
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
  const plateboundScore = !ph
    ? calculatePlateboundScore(aiOverview, place.rating, place.priceLevel, place.userRatingCount)
    : null;

  useEffect(() => {
    let cancelled = false;
    const loadPhotos = async () => {
      if (
        !place?.id ||
        !name ||
        typeof lat !== 'number' ||
        typeof lng !== 'number'
      ) {
        return;
      }
      try {
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
        setHeroPhotos(urls && urls.length > 0 ? urls : (place.photos || []));
      } catch (err) {
        console.warn('[random-result] Failed to load photos:', err);
      }
    };
    loadPhotos();
    return () => { cancelled = true; };
  }, [place]);

  useEffect(() => {
    let cancelled = false;
    const loadMenu = async () => {
      if (!place || !place.id) return;
      try {
        const items = await fetchAiMenu(place.id, place.websiteUri || undefined, name, place.primaryType || undefined);
        if (!cancelled && Array.isArray(items) && items.length > 0) {
          setMenuItems(items);
        }
      } catch (err) {
        console.warn('[random-result] Failed to load menu:', err);
      }
    };
    loadMenu();
    return () => { cancelled = true; };
  }, [place, name]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${name}!\n${address}\n${website || ''}`,
        title: name,
      });
    } catch { }
  };

  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const stickyBottom = insets.bottom + 10;

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
  const healthWord =
    healthScore >= 7
      ? t('result.healthTier.nutritious')
      : healthScore >= 4
        ? t('result.healthTier.moderate')
        : t('result.healthTier.indulgent');
  const plateboundWord =
    pScore >= 8
      ? t('result.matchTier.excellent')
      : pScore >= 6.5
        ? t('result.matchTier.great')
        : pScore >= 4.5
          ? t('result.matchTier.good')
          : t('result.matchTier.fair');
  const matchPct = place._matchScore;
  const matchAccentHex = matchPct != null ? scoreColor(matchPct / 10) : accentHex;
  const macroPills = aiOverview?.absoluteMacros
    ? parseMacroPills(aiOverview.absoluteMacros)
    : [];
  const sortedPerformanceMetrics = sortMetricsByScore(aiOverview, PERFORMANCE_METRICS);
  const sortedNutritionMetrics = sortMetricsByScore(aiOverview, NUTRITION_METRICS);

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.bg}
    >
      <NeonAmbientGlow />
      <View style={styles.root}>
        <View style={[styles.floatingHeader, { paddingTop: insets.top + 6 }]}>
          <AnimatedPressable
            style={[styles.headerBtn, styles.headerBtnGlass]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </AnimatedPressable>
          <TouchableOpacity
            style={[styles.headerBtn, styles.headerBtnGlass]}
            onPress={handleShare}
            activeOpacity={0.82}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: stickyBottom + 72 }}
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
          <ReAnimated.View entering={FadeIn.duration(350)}>
            <View style={styles.heroWrap}>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {heroPhotos.length > 0 ? heroPhotos.slice(0, 3).map((photo, i) => (
                  <View key={i} style={{ width: SCREEN_W, height: HERO_H }}>
                    <RestaurantImage
                      restaurantId={`${place.id ?? 'unknown'}_${i}`}
                      photos={[photo]}
                      width={SCREEN_W}
                      height={HERO_H}
                      quality={800}
                      loadDelay={0}
                      borderRadius={0}
                    />
                  </View>
                )) : (
                  <View style={{ width: SCREEN_W, height: HERO_H }}>
                    <RestaurantImage
                      restaurantId={place.id ?? 'unknown'}
                      photos={[]}
                      width={SCREEN_W}
                      height={HERO_H}
                      quality={800}
                      loadDelay={0}
                      borderRadius={0}
                    />
                  </View>
                )}
              </ScrollView>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={[styles.heroOverlay, { paddingTop: insets.top + 52 }]}>
              <View style={styles.badgeRow}>
                {type ? (
                  <View style={[styles.typeBadge, { borderColor: theme.tint + '66' }]}>
                    <TranslatedText text={type} style={[styles.typeBadgeText, { color: '#FFFFFF' }]} />
                  </View>
                ) : null}
                {price ? (
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceBadgeText}>{price}</Text>
                  </View>
                ) : null}
                <View style={styles.openBadge}>
                  <View
                    style={[
                      styles.openDot,
                      { backgroundColor: isOpen ? '#4CD964' : '#FF6B6B' },
                    ]}
                  />
                  <Text style={{ color: isOpen ? '#4CD964' : '#FF6B6B', fontSize: 11, fontWeight: '700' }}>
                    {isOpen ? t('map.openStatus') : t('map.closedStatus')}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroName} numberOfLines={2}>
                {name}
              </Text>
              <View style={styles.heroMeta}>
                {typeof rating === 'number' && rating > 0 ? (
                  <View style={styles.heroMetaItem}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.heroMetaText}>{rating.toFixed(1)}</Text>
                    {reviews ? (
                      <Text style={styles.heroMetaSub}>
                        ({reviews >= 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews})
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.heroMetaItem}>
                  <Ionicons name="navigate-outline" size={12} color="#F9A06F" />
                  <Text style={styles.heroMetaText}>{dist}</Text>
                </View>
              </View>
            </View>
            </View>
          </ReAnimated.View>

          <ReAnimated.View entering={FadeInUp.delay(160).springify()}>
            <View>
            {plateboundScore != null ? (
              <View
                style={[
                  styles.scoreCard,
                  { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor },
                ]}
              >
                {matchPct != null ? (
                  <OrbitalGauge
                    score={matchPct}
                    max={100}
                    ringColor={matchAccentHex}
                    theme={theme}
                    centerText={`${Math.round(matchPct)}%`}
                    centerSub={t('result.matchScore')}
                    label={t('result.matchScore')}
                  />
                ) : null}
                <OrbitalGauge
                  score={plateboundScore}
                  ringColor={accentHex}
                  theme={theme}
                  centerText={plateboundScore.toFixed(1)}
                  centerSub={plateboundWord}
                  label="Logic Plate"
                />
                <OrbitalGauge
                  score={healthScore}
                  ringColor="#4CD964"
                  theme={theme}
                  centerText={healthWord}
                  centerSub={`${healthScore.toFixed(1)}/10`}
                  label={t('result.healthScore')}
                />
              </View>
            ) : null}

            {!ph ? (
              <SectionCard title={t('map.aiOverview')} icon="sparkles" theme={theme} accordionKey="aiOverview">
                <AiOverviewSummaryBody
                  text={aiOverview!.summaryGoodBad || t('result.noSummary')}
                  style={[styles.bodyText, { color: theme.subtext }]}
                />
                {aiOverview?.whoThisPlaceIsFor ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.cardBorderColor }]} />
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardEmoji}>🎯</Text>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>{t('map.whoIsItFor')}</Text>
                    </View>
                    <TranslatedText text={aiOverview.whoThisPlaceIsFor} style={[styles.bodyText, { color: theme.subtext }]} />
                  </>
                ) : null}
              </SectionCard>
            ) : null}

            {menuItems && menuItems.length > 0 ? (
              <View style={{ marginTop: 12, marginBottom: 4 }}>
                <SectionCard
                  title={t('result.top3SignatureItems', { defaultValue: 'Top 3 Signature Items' })}
                  icon="restaurant-outline"
                  theme={theme}
                  accordionKey="menu"
                  defaultExpanded={true}
                >
                  <View style={{ gap: 10 }}>
                    {menuItems.map((item, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 14, color: theme.accent, marginTop: 2 }}>🍽️</Text>
                        <TranslatedText text={item} style={[styles.bodyText, { color: theme.text, flex: 1, fontWeight: '600', fontSize: 14 }]} />
                      </View>
                    ))}
                  </View>
                </SectionCard>
              </View>
            ) : null}

            {!ph ? (
              <SectionCard title={t('scores.performance')} icon="analytics-outline" theme={theme} accordionKey="performance">
                <VibeStatsPodium
                  ai={aiOverview}
                  theme={theme}
                  compact
                  embedded
                  title={null}
                />
                <View style={styles.chipsGrid}>
                  {sortedPerformanceMetrics.map(m => (
                    <MetricChip
                      key={m.key}
                      emoji={m.emoji}
                      label={t(`scores.${m.labelKey}`)}
                      value={aiOverview?.[m.key] as number | undefined}
                      max={m.max}
                      theme={theme}
                    />
                  ))}
                </View>
              </SectionCard>
            ) : null}

            {!ph ? (
              <SectionCard title={t('scores.nutrition')} icon="nutrition-outline" theme={theme} accordionKey="nutrition">
                <View style={styles.chipsGrid}>
                  {sortedNutritionMetrics.map(m => (
                    <MetricChip
                      key={m.key}
                      emoji={m.emoji}
                      label={t(`scores.${m.labelKey}`)}
                      value={aiOverview?.[m.key] as number | undefined}
                      max={m.max}
                      theme={theme}
                    />
                  ))}
                </View>
                {macroPills.length > 0 ? (
                  <View style={[styles.macroRow, { marginTop: 12 }]}>
                    {macroPills.map(p => (
                      <View
                        key={p.labelKey}
                        style={[
                          styles.macroPill,
                          {
                            backgroundColor: theme.glassBackground,
                            borderColor: theme.cardBorderColor,
                          },
                        ]}
                      >
                        <Text style={styles.macroEmoji}>{p.emoji}</Text>
                        <Text style={[styles.macroLabel, { color: theme.subtext }]}>
                          {t(`scores.macros.${p.labelKey}`)}
                        </Text>
                        <Text style={[styles.macroValue, { color: theme.text }]}>{p.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {aiOverview?.absoluteMacros ? (
                  <TranslatedText text={aiOverview.absoluteMacros} style={[styles.bodyText, { color: theme.subtext, marginTop: 12 }]} />
                ) : null}
              </SectionCard>
            ) : null}

            {hasContact || weekdays.length > 0 ? (
              <SectionCard title={t('scores.contactHours')} icon="time-outline" theme={theme} accordionKey="contact" defaultExpanded={false}>
                {hasContact ? (
                  <>
                    {address ? (
                      <ContactRow
                        icon="location-outline"
                        value={address}
                        hint={addressCopied ? t('result.copied') : t('result.tapToCopy')}
                        theme={theme}
                        onPress={copyAddress}
                      />
                    ) : null}
                    {address && phone ? (
                      <View style={[styles.divider, { backgroundColor: theme.cardBorderColor }]} />
                    ) : null}
                    {phone ? (
                      <ContactRow
                        icon="call-outline"
                        value={phone}
                        hint={t('result.tapToCall')}
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
                        hint={t('result.tapToOpen')}
                        theme={theme}
                        onPress={() => Linking.openURL(website)}
                        accentColor={theme.tint}
                      />
                    ) : null}
                  </>
                ) : null}
                {weekdays.length > 0 ? (
                  <>
                    {hasContact ? (
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: theme.cardBorderColor, marginTop: 8 },
                        ]}
                      />
                    ) : null}
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
                          {formatWeekdayHours(line)}
                        </Text>
                      ))}
                    </View>
                  </>
                ) : null}
              </SectionCard>
            ) : null}

            <View style={{ height: 16 }} />
            </View>
          </ReAnimated.View>
        </ScrollView>

        <ReAnimated.View entering={FadeInUp.delay(280).springify()}>
          <View
            style={[
              styles.stickyBar,
              {
                paddingBottom: stickyBottom,
                backgroundColor: theme.cardBackground + 'F2',
                borderTopColor: theme.cardBorderColor,
              },
            ]}
          >
          <TouchableOpacity
            animated={false}
            style={[
              styles.stickyGhost,
              { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
            ]}
            onPress={() => {
              if (place?.id) setMapFocusRestaurant(place);
              router.push('/(tabs)/map');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={17} color={theme.subtext} />
            <Text style={[styles.stickyGhostText, { color: theme.subtext }]}>{t('result.mapPage')}</Text>
          </TouchableOpacity>
          {website ? (
            <TouchableOpacity
              animated={false}
              style={[
                styles.stickyMiddle,
                { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
              ]}
              onPress={() => Linking.openURL(website)}
              activeOpacity={0.8}
            >
              <Ionicons name="globe-outline" size={17} color={theme.text} />
              <Text style={[styles.stickyGhostText, { color: theme.text }]}>{t('result.viewWebsite')}</Text>
            </TouchableOpacity>
          ) : null}
          {mapsReady ? (
            <TouchableOpacity
              animated={false}
              style={[styles.stickyPrimary, { backgroundColor: theme.accent }]}
              onPress={() => openGoogleMaps(name, lat!, lng!)}
              activeOpacity={0.88}
            >
              <Ionicons name="navigate" size={18} color="#000000" />
              <Text style={[styles.stickyPrimaryText, { color: '#000000' }]}>
                {t('result.goThere')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.stickyPrimary, { backgroundColor: theme.subtext + '44' }]}>
              <Text style={[styles.stickyPrimaryText, { color: theme.subtext }]}>
                {t('result.noLocation')}
              </Text>
            </View>
          )}
          </View>
        </ReAnimated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  primaryCtaBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    shadowColor: '#F9A06F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    gap: 8,
  },
  primaryCtaText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  bg: { flex: 1 },
  root: { flex: 1 },

  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnGlass: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  heroWrap: { height: HERO_H, width: '100%', overflow: 'hidden' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeBadge: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  priceBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '800', color: '#F9A06F' },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  heroName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 34,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  heroMetaSub: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },

  scoreCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  orbWrap: { alignItems: 'center', gap: 4 },
  orbLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardEmoji: { fontSize: 15 },
  bodyText: { fontSize: 14, lineHeight: 21 },

  drawer: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  drawerIconBg: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerHeaderText: { flex: 1, gap: 2 },
  drawerTitle: { fontSize: 14, fontWeight: '700' },
  drawerBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },

  chipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    width: '31%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 9,
    gap: 3,
  },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  chipDetail: { fontSize: 11, fontWeight: '800', marginTop: 1 },
  chipValue: { fontSize: 12, fontWeight: '800' },
  chipMax: { fontSize: 10, fontWeight: '600' },
  chipTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 2,
  },
  chipFill: { height: '100%', borderRadius: 2 },

  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  macroPill: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 72,
    gap: 2,
  },
  macroEmoji: { fontSize: 18 },
  macroLabel: { fontSize: 10, fontWeight: '600' },
  macroValue: { fontSize: 13, fontWeight: '800' },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 },
  contactIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactValue: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  contactHint: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  divider: { height: 1, marginVertical: 2, marginLeft: 44 },

  hoursList: { gap: 3 },
  hoursLine: { fontSize: 13, lineHeight: 20 },
  hoursLineToday: { fontWeight: '700' },

  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    zIndex: 40,
  },
  stickyGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  stickyMiddle: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  stickyGhostText: { fontSize: 14, fontWeight: '700' },
  stickyPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  stickyPrimaryText: { fontSize: 15, fontWeight: '800' },
});
