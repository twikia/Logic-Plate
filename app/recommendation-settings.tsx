import { PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { useAppTheme } from '@/context/ThemeContext';
import { PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import { getRecommendationPrefs, saveRecommendationPrefs } from '@/core/recommendationPrefs';
import {
  DEFAULT_PREFS_V1,
  DEFAULT_WEIGHTS,
  type ImportanceLevel,
  type RecommendationPrefsV1,
  type RecommendationWeights,
} from '@/core/recommendationTypes';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecommendationSettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [prefs, setPrefs] = useState<RecommendationPrefsV1 | null>(null);

  const persist = useCallback(async (next: RecommendationPrefsV1) => {
    setPrefs(next);
    await saveRecommendationPrefs(next);
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
            Tap an emoji level (1–5) for each factor. We only show open restaurants and weigh picks using your three
            priority areas below.
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

          <Text style={[styles.sectionLabel, { color: theme.accent, marginTop: 24 }]}>Favorite cuisines</Text>
          <Text style={[styles.cuisineHint, { color: theme.subtext }]}>
            How much these steer picks is set by Favorite cuisine adherence in Taste & cuisine above.
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

          <View style={[styles.noteCard, { backgroundColor: theme.buttonBackground }]}>
            <Text style={[styles.noteText, { color: theme.subtext }]}>
              Open now is always on — we filter to places that are open at the restaurant local time.
            </Text>
          </View>
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
  resetBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  resetText: { fontWeight: '700', fontSize: 14 },
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
  noteCard: { borderRadius: 14, padding: 14, marginTop: 8 },
  noteText: { fontSize: 13, lineHeight: 19 },
});
