import {
  RestaurantLoadingProgressBar,
  useRestaurantLoadProgress,
} from '@/components/RestaurantLoadingProgress';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { getLocation } from '@/core/locationCache';
import { RestaurantImage } from '@/core/images';
import { pickSurpriseFromRanked } from '@/core/recommendationFeedback';
import { fetchIsLikelyRainNow } from '@/core/openMeteoWeather';
import { applyRerollDiversityQueue, scoreRestaurantPool } from '@/core/recommendationEngine';
import { getRecommendationPrefs } from '@/core/recommendationPrefs';
import {
  defaultGroupToSessionChip,
  inferMealTypeFromClock,
  radiusIdToMeters,
  type MealTypeContext,
  type RecommendationPrefsV1,
  type ScoredRestaurant,
  type SessionGroupChip,
  type SessionMood,
  type SessionOverrides,
} from '@/core/recommendationTypes';
import {
  getNearbyRestaurants,
  isRestaurantLoadSupersededError,
} from '@/core/restaurantOrchestrator';
import { appendVisit, loadVisits } from '@/core/recommendationVisitHistory';
import { useDistanceFormatter } from '@/hooks/useDistanceFormatter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
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

const MEALS: { id: MealTypeContext; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'late_night', label: 'Late night' },
];

const GROUPS: { id: SessionGroupChip; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'partner', label: 'Partner' },
  { id: 'small_group', label: 'Small group' },
  { id: 'big_group', label: 'Big group' },
];

const DIST_OPTS: { meters: number; label: string }[] = [
  { meters: 800, label: 'Walking' },
  { meters: 3000, label: 'Short drive' },
  { meters: 8000, label: 'Worth the trip' },
];

const MOODS: { id: SessionMood; label: string }[] = [
  { id: 'comfort', label: 'Comfort' },
  { id: 'light', label: 'Light' },
  { id: 'adventurous', label: 'Adventurous' },
  { id: 'quick', label: 'Quick' },
  { id: 'special', label: 'Special occasion' },
];

function distanceChipLabel(m: number): string {
  if (m <= 900) return 'Walking';
  if (m <= 3500) return 'Short drive';
  return 'Worth the trip';
}

function SpotlightCard({
  scored,
  onPress,
  onOpenMap,
}: {
  scored: ScoredRestaurant;
  onPress: () => void;
  onOpenMap: () => void;
}) {
  const place = scored.place;
  const name = place.displayName?.text || 'Unknown';
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const mapsReady = typeof lat === 'number' && typeof lng === 'number';
  const { formatDistance } = useDistanceFormatter();
  const rating = place.rating != null ? Number(place.rating).toFixed(1) : null;
  const match = Math.round(scored.plateboundScore);

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.spotlightCard} onPress={onPress}>
      <Text style={styles.spotlightBadge}>Your pick</Text>
      <View style={styles.spotlightTop}>
        <View style={styles.spotlightThumbWrap}>
          <RestaurantImage
            restaurantId={place.id}
            photos={place.photos || []}
            width={96}
            height={96}
            quality={240}
            loadDelay={200}
            borderRadius={16}
          />
        </View>
        <View style={styles.spotlightInfo}>
          <Text style={styles.spotlightTitle} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.spotlightSub} numberOfLines={1}>
            {formatDistance(Math.round(place.distanceMeters ?? 0))} away
            {rating ? ` · ${rating}` : ''}
          </Text>
          <Text style={styles.matchLine}>
            {match}% match
          </Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        {scored.matchPills.map(p => (
          <View key={p.kind} style={styles.pill}>
            <Text style={styles.pillEmoji}>{p.emoji}</Text>
            <Text style={styles.pillLabel} numberOfLines={1}>
              {p.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.spotlightActions}>
        <TouchableOpacity
          style={[styles.spotlightAction, styles.spotlightActionPrimary, !mapsReady && styles.spotlightActionDisabled]}
          onPress={e => {
            e.stopPropagation();
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
          style={[styles.spotlightAction, styles.spotlightActionGhost]}
          onPress={e => {
            e.stopPropagation();
            onOpenMap();
          }}
        >
          <Ionicons name="map-outline" size={16} color="#F9A06F" />
          <Text style={[styles.spotlightActionText, styles.spotlightGhostText]} numberOfLines={1}>
            Map tab
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.spotlightHint}>Tap card for full details</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const sessionRadiusRef = useRef(4000);
  const shownPlaceIdsRef = useRef<Set<string>>(new Set());

  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);
  const [session, setSession] = useState<SessionOverrides | null>(null);
  const [rawPlaces, setRawPlaces] = useState<any[]>([]);
  const [ranked, setRanked] = useState<ScoredRestaurant[]>([]);
  const [rerollQueue, setRerollQueue] = useState<ScoredRestaurant[]>([]);
  const [rerollStep, setRerollStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chipModal, setChipModal] = useState<
    null | 'meal' | 'group' | 'budget' | 'distance' | 'mood'
  >(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(20);

  const {
    loadingStage,
    loadingProgress,
    startGpsPhase,
    startFetchPhase,
    onOrchestratorProgress,
    snapProgressComplete,
  } = useRestaurantLoadProgress(isLoading, 'health');

  useEffect(() => {
    void getRecommendationPrefs().then(p => {
      setPrefs(p);
      setSession({
        mealType: inferMealTypeFromClock(),
        groupSize: defaultGroupToSessionChip(p.defaultGroupSize),
        budgetCeiling: p.budgetCeiling,
        radiusMeters: radiusIdToMeters(p.defaultRadius),
        sessionMood: null,
      });
    });
  }, []);

  useEffect(() => {
    if (session) sessionRadiusRef.current = session.radiusMeters;
  }, [session?.radiusMeters]);

  const recompute = useCallback(async () => {
    const coords = coordsRef.current;
    if (!prefs || !session || !coords || rawPlaces.length === 0) return;
    const visits = await loadVisits();
    const rainy = await fetchIsLikelyRainNow(coords.latitude, coords.longitude);
    const scored = scoreRestaurantPool(rawPlaces, {
      prefs,
      session,
      visits,
      userLat: coords.latitude,
      userLng: coords.longitude,
      rainyWeather: rainy === true ? true : undefined,
    });
    setRanked(scored);
    setRerollQueue(applyRerollDiversityQueue(scored, 2, 10));
    setRerollStep(0);
  }, [prefs, session, rawPlaces]);

  useEffect(() => {
    void recompute();
  }, [recompute]);

  const loadSpotlight = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    startGpsPhase();
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
      startFetchPhase();
      const all = await getNearbyRestaurants(
        coords.latitude,
        coords.longitude,
        rad,
        onOrchestratorProgress,
        {
          onAiReady: enriched => {
            setRawPlaces(enriched);
          },
        }
      );
      shownPlaceIdsRef.current = new Set();
      setRawPlaces(all);
    } catch (e) {
      if (isRestaurantLoadSupersededError(e)) {
        return;
      }
      setErrorMsg('Could not load restaurants nearby.');
      setRawPlaces([]);
    } finally {
      snapProgressComplete();
      setIsLoading(false);
    }
  }, [onOrchestratorProgress, snapProgressComplete, startFetchPhase, startGpsPhase]);

  useEffect(() => {
    if (prefs && session) {
      void loadSpotlight();
    }
  }, [loadSpotlight, prefs, session?.radiusMeters]);

  const currentScored = useMemo(() => {
    if (ranked.length === 0) return null;
    if (rerollStep <= 0) return ranked[0]!;
    return rerollQueue[rerollStep - 1] ?? null;
  }, [ranked, rerollQueue, rerollStep]);

  useEffect(() => {
    const id = currentScored?.place?.id;
    if (id) shownPlaceIdsRef.current.add(String(id));
  }, [currentScored?.place?.id]);

  const canReroll =
    (rerollStep === 0 && ranked.length > 1) || (rerollStep > 0 && rerollStep < rerollQueue.length);

  const pickReroll = () => {
    if (!canReroll) return;
    setRerollStep(s => s + 1);
  };

  const openDetails = async (item: ScoredRestaurant) => {
    await appendVisit(String(item.place?.id || ''), String(item.place?.primaryType || ''));
    setCurrentRestaurant(item.place);
    router.push('/random-result');
  };

  const mealLabel = (m: MealTypeContext) => MEALS.find(x => x.id === m)?.label ?? m;
  const groupLabel = (g: SessionGroupChip) => GROUPS.find(x => x.id === g)?.label ?? g;
  const moodLabel = (m: SessionMood) => MOODS.find(x => x.id === m)?.label ?? m;

  const showFeedbackHint = rerollStep >= 3;

  const applySurprisePick = () => {
    if (!ranked.length) return;
    const hit = pickSurpriseFromRanked(
      ranked,
      shownPlaceIdsRef.current,
      currentScored?.place?.primaryType ?? null
    );
    if (hit?.place?.id) {
      setRerollStep(0);
      const rest = ranked.filter(r => r.place?.id !== hit.place?.id);
      setRanked([hit, ...rest]);
      setRerollQueue(applyRerollDiversityQueue([hit, ...rest], 2, 10));
    }
    setFeedbackOpen(false);
  };

  const emptyAfterLoad = !isLoading && !errorMsg && ranked.length === 0;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.text }]}>Find your meal</Text>

          {prefs && session && !isLoading && !errorMsg && ranked.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              <TouchableOpacity style={styles.chip} onPress={() => setChipModal('meal')}>
                <Text style={styles.chipText}>{mealLabel(session.mealType)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip} onPress={() => setChipModal('group')}>
                <Text style={styles.chipText}>{groupLabel(session.groupSize)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chip}
                onPress={() => {
                  setBudgetDraft(session.budgetCeiling);
                  setChipModal('budget');
                }}
              >
                <Text style={styles.chipText}>~${Math.round(session.budgetCeiling)}pp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chip} onPress={() => setChipModal('distance')}>
                <Text style={styles.chipText}>{distanceChipLabel(session.radiusMeters)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chip}
                onPress={() => setChipModal('mood')}
              >
                <Text style={styles.chipText}>{session.sessionMood ? moodLabel(session.sessionMood) : '+ mood'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {isLoading ? (
            <RestaurantLoadingProgressBar
              stageLabel={loadingStage}
              progress={loadingProgress}
              style={styles.loadingBox}
            />
          ) : errorMsg ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSpotlight}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : emptyAfterLoad ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>No restaurants matched your filters nearby.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadSpotlight}>
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : currentScored ? (
            <SpotlightCard
              scored={currentScored}
              onPress={() => void openDetails(currentScored)}
              onOpenMap={() => router.push('/map' as any)}
            />
          ) : null}

          {showFeedbackHint && currentScored && (
            <TouchableOpacity onPress={() => setFeedbackOpen(true)} style={styles.feedbackHint}>
              <Text style={styles.feedbackHintText}>Still looking? Try another pick →</Text>
            </TouchableOpacity>
          )}

          {!isLoading && !errorMsg && ranked.length > 0 && (
            <AnimatedPressable
              onPress={pickReroll}
              style={[
                styles.nextBtn,
                { backgroundColor: theme.cardBackground },
                !canReroll && { opacity: 0.45 },
              ]}
              disabled={!canReroll}
            >
              <Ionicons name="shuffle" size={26} color={theme.accent} />
              <Text style={[styles.nextLabel, { color: theme.text }]}>Reroll</Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            onPress={() => router.push('/pick-categories')}
            style={[styles.specificBtn, { borderColor: 'rgba(255,255,255,0.35)' }]}
          >
            <Ionicons name="options-outline" size={22} color={theme.text} />
            <Text style={[styles.specificLabel, { color: theme.text }]}>Try something specific</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={chipModal !== null} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setChipModal(null)} />
          <View style={[styles.modalCard, { backgroundColor: theme.cardBackground }]}>
          {chipModal === 'meal' &&
            MEALS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={styles.modalRow}
                onPress={() => {
                  setSession(s => (s ? { ...s, mealType: m.id } : s));
                  setChipModal(null);
                }}
              >
                <Text style={[styles.modalRowText, { color: theme.text }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          {chipModal === 'group' &&
            GROUPS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={styles.modalRow}
                onPress={() => {
                  setSession(s => (s ? { ...s, groupSize: m.id } : s));
                  setChipModal(null);
                }}
              >
                <Text style={[styles.modalRowText, { color: theme.text }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          {chipModal === 'budget' && session && (
            <View style={{ paddingVertical: 8 }}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Budget per person</Text>
              <Text style={[styles.budgetShow, { color: theme.accent }]}>${Math.round(budgetDraft)}</Text>
              <Slider
                minimumValue={5}
                maximumValue={100}
                step={1}
                value={budgetDraft}
                onValueChange={setBudgetDraft}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor="rgba(255,255,255,0.15)"
                thumbTintColor="#FFFFFF"
              />
              <TouchableOpacity
                style={[styles.modalOk, { backgroundColor: theme.accent }]}
                onPress={() => {
                  setSession(s => (s ? { ...s, budgetCeiling: budgetDraft } : s));
                  setChipModal(null);
                }}
              >
                <Text style={styles.modalOkText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
          {chipModal === 'distance' &&
            DIST_OPTS.map(d => (
              <TouchableOpacity
                key={d.meters}
                style={styles.modalRow}
                onPress={() => {
                  setSession(s => (s ? { ...s, radiusMeters: d.meters } : s));
                  setChipModal(null);
                  void loadSpotlight();
                }}
              >
                <Text style={[styles.modalRowText, { color: theme.text }]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          {chipModal === 'mood' && (
            <View>
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  setSession(s => (s ? { ...s, sessionMood: null } : s));
                  setChipModal(null);
                }}
              >
                <Text style={[styles.modalRowText, { color: theme.subtext }]}>Clear mood</Text>
              </TouchableOpacity>
              {MOODS.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalRow}
                  onPress={() => {
                    setSession(s => (s ? { ...s, sessionMood: m.id } : s));
                    setChipModal(null);
                  }}
                >
                  <Text style={[styles.modalRowText, { color: theme.text }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          </View>
        </View>
      </Modal>

      <Modal visible={feedbackOpen} transparent animationType="slide">
        <View style={styles.feedbackWrap}>
          <View style={[styles.feedbackCard, { backgroundColor: theme.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Try another place</Text>
            <Text style={[styles.feedbackBody, { color: theme.subtext }]}>
              We will choose a restaurant you have not seen in this round, shuffled among strong matches and
              biased away from the same cuisine type when possible.
            </Text>
            <View style={styles.feedbackActions}>
              <TouchableOpacity onPress={() => setFeedbackOpen(false)} style={styles.feedbackCancel}>
                <Text style={{ color: theme.subtext }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applySurprisePick}
                style={[styles.feedbackGo, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.modalOkText}>Surprise me</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, paddingTop: 44 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 18,
  },
  chipScroll: { gap: 8, paddingBottom: 4 },
  chip: {
    backgroundColor: 'rgba(30,15,30,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginRight: 8,
  },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
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
  spotlightCard: {
    backgroundColor: 'rgba(30,15,30,0.58)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 14,
  },
  spotlightBadge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    color: '#F9A06F',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  spotlightTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  spotlightThumbWrap: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden' },
  spotlightInfo: { flex: 1, gap: 4 },
  spotlightTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  spotlightSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  matchLine: { fontSize: 16, color: '#BFF5B8', fontWeight: '800', marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  pillEmoji: { fontSize: 14 },
  pillLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  spotlightActions: { flexDirection: 'row', gap: 10 },
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
  spotlightActionPrimary: { backgroundColor: '#F97352' },
  spotlightActionGhost: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  spotlightActionDisabled: { opacity: 0.45 },
  spotlightActionText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  spotlightGhostText: { color: '#F9A06F' },
  spotlightHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: -4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  nextLabel: { fontSize: 18, fontWeight: '800' },
  specificBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  specificLabel: { flex: 1, fontSize: 17, fontWeight: '700' },
  feedbackHint: { alignSelf: 'center', paddingVertical: 6 },
  feedbackHintText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  modalRoot: { flex: 1, justifyContent: 'center' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    marginHorizontal: 24,
    borderRadius: 18,
    padding: 8,
    maxHeight: '50%',
  },
  modalRow: { paddingVertical: 14, paddingHorizontal: 12 },
  modalRowText: { fontSize: 16, fontWeight: '600' },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  budgetShow: { fontSize: 32, fontWeight: '900', textAlign: 'center', marginVertical: 8 },
  modalOk: { marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalOkText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  feedbackWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  feedbackCard: { padding: 20, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  feedbackBody: { fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 4 },
  feedbackActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  feedbackCancel: { paddingVertical: 10, paddingHorizontal: 8 },
  feedbackGo: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22, minWidth: 80, alignItems: 'center' },
});
