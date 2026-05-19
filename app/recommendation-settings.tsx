import { PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { useAppTheme } from '@/context/ThemeContext';
import { PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import { getRecommendationPrefs, saveRecommendationPrefs } from '@/core/recommendationPrefs';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type DefaultGroupSize,
  type DefaultRadiusId,
  type DietaryFilterId,
  type ImportanceLevel,
  type RecommendationPrefsV1,
  type RecommendationWeights,
  radiusIdToMeters,
} from '@/core/recommendationTypes';
import { setSearchRadius } from '@/core/userSettings';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

const GROUP_OPTIONS: { id: DefaultGroupSize; label: string }[] = [
  { id: 'solo', label: 'Just me' },
  { id: 'partner', label: 'Partner / date' },
  { id: 'small_group', label: 'Small group (3–4)' },
  { id: 'big_group', label: 'Big group (5+)' },
  { id: 'varies', label: 'It varies' },
];

const DIETARY: { id: DietaryFilterId | 'none'; label: string }[] = [
  { id: 'none', label: 'No restrictions' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'gluten_free', label: 'Gluten-free options needed' },
  { id: 'dairy_free', label: 'Dairy-free options needed' },
  { id: 'nut_allergy', label: 'Nut allergy awareness needed' },
];

const RADIUS_OPTIONS: { id: DefaultRadiusId; label: string }[] = [
  { id: 'walking', label: 'Walking (~800m)' },
  { id: 'short_drive', label: 'Short drive (~3km)' },
  { id: 'worth_trip', label: 'Worth the trip (~8km)' },
];

export default function RecommendationSettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);

  const persist = useCallback(async (next: RecommendationPrefsV1) => {
    setPrefs(next);
    await saveRecommendationPrefs(next);
    await setSearchRadius(radiusIdToMeters(next.defaultRadius));
  }, []);

  useEffect(() => {
    void getRecommendationPrefs().then(setPrefs);
  }, []);

  if (!prefs) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.cardBackground }]}>
        <Text style={{ color: theme.text }}>Loading…</Text>
      </View>
    );
  }

  const setWeight = (key: keyof RecommendationWeights, level: ImportanceLevel) => {
    void persist({ ...prefs, weights: { ...prefs.weights, [key]: level } });
  };

  const toggleDietary = (id: DietaryFilterId | 'none') => {
    if (id === 'none') void persist({ ...prefs, dietaryFilters: [] });
    else {
      const s = new Set(prefs.dietaryFilters);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      void persist({ ...prefs, dietaryFilters: Array.from(s) as DietaryFilterId[] });
    }
  };

  const toggleCuisine = (id: string) => {
    const s = new Set(prefs.favoriteCuisines);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    const next = Array.from(s);
    void persist({ ...prefs, favoriteCuisines: next.length ? next : [...DEFAULT_PREFS_V1.favoriteCuisines] });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Recommendations</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: theme.accent }]}>What matters to you</Text>
          <Text style={[styles.sectionIntro, { color: theme.subtext }]}>
            Tap an emoji level (1–5) for each factor. Favorite cuisine adherence controls how strongly your picks below influence recommendations.
          </Text>

          {PRIORITY_METRIC_SCREENS.map((screen, screenIdx) => (
            <View
              key={screen.id}
              style={[styles.metricSection, { backgroundColor: theme.buttonBackground }]}
            >
              <Text style={[styles.metricSectionTitle, { color: theme.text }]}>{screen.title}</Text>
              <Text style={[styles.metricSectionSub, { color: theme.subtext }]}>{screen.subtitle}</Text>
              <PriorityMetricsPanel
                weights={prefs.weights}
                onWeightChange={setWeight}
                screenIndex={screenIdx}
                compact
              />
            </View>
          ))}

          <Pressable
            style={[styles.resetBtn, { borderColor: theme.accent }]}
            onPress={() => void persist({ ...prefs, weights: { ...DEFAULT_WEIGHTS } })}
          >
            <Text style={[styles.resetText, { color: theme.accent }]}>Reset priorities to defaults</Text>
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.accent, marginTop: 24 }]}>My preferences</Text>
          <Text style={[styles.miniHead, { color: theme.subtext }]}>Default group size</Text>
          <View style={styles.wrap}>
            {GROUP_OPTIONS.map(g => (
              <Pressable
                key={g.id}
                onPress={() => void persist({ ...prefs, defaultGroupSize: g.id })}
                style={[
                  styles.chip,
                  prefs.defaultGroupSize === g.id && { borderColor: theme.accent, backgroundColor: 'rgba(249,115,82,0.12)' },
                  { borderColor: 'rgba(255,255,255,0.12)' },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.miniHead, { color: theme.subtext }]}>Dietary filters</Text>
          <View style={styles.wrap}>
            {DIETARY.map(d => {
              const active = d.id === 'none' ? prefs.dietaryFilters.length === 0 : prefs.dietaryFilters.includes(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => toggleDietary(d.id)}
                  style={[
                    styles.chip,
                    active && { borderColor: theme.accent, backgroundColor: 'rgba(249,115,82,0.12)' },
                    { borderColor: 'rgba(255,255,255,0.12)' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.card, { backgroundColor: theme.buttonBackground }]}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Budget per person</Text>
            <Text style={[styles.rowVal, { color: theme.accent }]}>${Math.round(prefs.budgetCeiling)}</Text>
            <Slider
              minimumValue={5}
              maximumValue={100}
              step={1}
              value={prefs.budgetCeiling}
              onSlidingComplete={v => void persist({ ...prefs, budgetCeiling: v })}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="#FFFFFF"
            />
          </View>

          <Text style={[styles.miniHead, { color: theme.subtext }]}>Default search radius</Text>
          <View style={styles.col}>
            {RADIUS_OPTIONS.map(r => (
              <Pressable
                key={r.id}
                onPress={() => void persist({ ...prefs, defaultRadius: r.id })}
                style={[
                  styles.rowPick,
                  { borderColor: prefs.defaultRadius === r.id ? theme.accent : 'rgba(255,255,255,0.12)' },
                  prefs.defaultRadius === r.id && { backgroundColor: 'rgba(249,115,82,0.1)' },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.rowBetween, styles.card, { backgroundColor: theme.buttonBackground }]}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Open now only</Text>
            <Switch
              value={prefs.openNowOnly}
              onValueChange={v => void persist({ ...prefs, openNowOnly: v })}
              trackColor={{ false: '#5C255C', true: theme.accent }}
            />
          </View>

          <View style={[styles.card, { backgroundColor: theme.buttonBackground }]}>
            <View style={styles.sliderHead}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Minimum rating</Text>
              <Text style={[styles.rowVal, { color: theme.accent }]}>{prefs.minimumRatingThreshold.toFixed(1)}</Text>
            </View>
            <Slider
              minimumValue={1}
              maximumValue={5}
              step={0.1}
              value={prefs.minimumRatingThreshold}
              onSlidingComplete={v => void persist({ ...prefs, minimumRatingThreshold: v })}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="#FFFFFF"
            />
          </View>

          <Text style={[styles.miniHead, { color: theme.subtext }]}>Favorite cuisines</Text>
          <Text style={[styles.cuisineHint, { color: theme.subtext }]}>
            How much these steer picks is set by Favorite cuisine adherence above.
          </Text>
          <View style={styles.cGrid}>
            {TOP_CUISINE_TILES.map(t => {
              const on = prefs.favoriteCuisines.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggleCuisine(t.id)}
                  style={[
                    styles.cTile,
                    on && { borderColor: theme.accent, backgroundColor: 'rgba(249,115,82,0.12)' },
                    { borderColor: 'rgba(255,255,255,0.12)' },
                  ]}
                >
                  <Text style={styles.cEmoji}>{t.emoji}</Text>
                  <Text style={[styles.cLabel, { color: theme.text }]} numberOfLines={2}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.accent, marginTop: 24 }]}>Novelty settings</Text>
          <View style={[styles.rowBetween, styles.card, { backgroundColor: theme.buttonBackground }]}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Penalize repeat visits</Text>
            <Switch
              value={prefs.penalizeRepeats}
              onValueChange={v => void persist({ ...prefs, penalizeRepeats: v })}
              trackColor={{ false: '#5C255C', true: theme.accent }}
            />
          </View>

          {prefs.penalizeRepeats && (
            <View style={[styles.card, { backgroundColor: theme.buttonBackground }]}>
              <View style={styles.sliderHead}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Cuisine repeat window (days)</Text>
                <Text style={[styles.rowVal, { color: theme.accent }]}>{prefs.cuisineRepeatWindowDays}</Text>
              </View>
              <Slider
                minimumValue={1}
                maximumValue={30}
                step={1}
                value={prefs.cuisineRepeatWindowDays}
                onSlidingComplete={v => void persist({ ...prefs, cuisineRepeatWindowDays: Math.round(v) })}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor="#FFFFFF"
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  sectionIntro: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  metricSection: { borderRadius: 14, padding: 14, marginBottom: 12 },
  metricSectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  metricSectionSub: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  miniHead: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  rowVal: { fontSize: 15, fontWeight: '800' },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  resetText: { fontWeight: '700', fontSize: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  chipText: { fontSize: 13, fontWeight: '600' },
  col: { gap: 8, marginBottom: 12 },
  rowPick: { borderWidth: 1, borderRadius: 12, padding: 12 },
  cuisineHint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  cGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  cTile: {
    width: '31%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    minHeight: 76,
    justifyContent: 'center',
  },
  cEmoji: { fontSize: 22, marginBottom: 4 },
  cLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
