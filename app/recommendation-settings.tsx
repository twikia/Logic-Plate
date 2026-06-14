import { ImportanceLevelPicker, PriorityMetricsPanel } from '@/components/ImportanceLevelPicker';
import { useAppTheme } from '@/context/ThemeContext';
import { CUISINE_FIT_METRIC, PRIORITY_METRIC_SCREENS } from '@/core/recommendationPriorityMetrics';
import { CuisineRankGrid } from '@/components/CuisineRankGrid';
import { getRecommendationPrefs, saveRecommendationPrefs } from '@/core/recommendationPrefs';
import {
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
import { useTranslation } from 'react-i18next';
import { hapticLight, hapticMedium } from '@/core/haptics';

export default function RecommendationSettingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useTranslation();
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
        <Text style={{ color: theme.text }}>{t('recommendations.loading')}</Text>
      </View>
    );
  }

  const setWeight = (key: keyof RecommendationWeights, level: ImportanceLevel) => {
    void persist({ ...prefs, weights: { ...prefs.weights, [key]: level } });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => { hapticLight(); router.back(); }} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('recommendations.title')}</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: theme.accent }]}>{t('recommendations.whatMatters')}</Text>
          <Text style={[styles.sectionIntro, { color: theme.subtext }]}>
            {t('recommendations.whatMattersIntro')}
          </Text>

          {PRIORITY_METRIC_SCREENS.map((screen, screenIdx) => (
            <View
              key={screen.id}
              style={[styles.metricSection, { backgroundColor: theme.buttonBackground }]}
            >
              <Text style={[styles.metricSectionTitle, { color: theme.text }]}>
                {t(`priorities.${screen.id}Title`)}
              </Text>
              <Text style={[styles.metricSectionSub, { color: theme.subtext }]}>
                {t(`priorities.${screen.id}Subtitle`)}
              </Text>
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
            onPress={() => { hapticMedium(); void persist({ ...prefs, weights: { ...DEFAULT_WEIGHTS } }); }}
          >
            <Text style={[styles.resetText, { color: theme.accent }]}>{t('recommendations.resetPriorities')}</Text>
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.accent, marginTop: 24 }]}>{t('recommendations.topCuisines')}</Text>
          <Text style={[styles.cuisineHint, { color: theme.subtext }]}>
            {t('recommendations.topCuisinesHint')}
          </Text>
          <ImportanceLevelPicker
            metric={CUISINE_FIT_METRIC}
            value={prefs.weights.cuisine}
            onChange={level => setWeight('cuisine', level)}
            compact
          />
          <CuisineRankGrid
            ranked={prefs.favoriteCuisines}
            onChange={next => void persist({ ...prefs, favoriteCuisines: next })}
            accent={theme.accent}
            textColor={theme.text}
            tileWidth="31%"
          />

          <View style={[styles.noteCard, { backgroundColor: theme.buttonBackground }]}>
            <Text style={[styles.noteText, { color: theme.subtext }]}>
              {t('recommendations.openNowNote')}
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
  noteCard: { borderRadius: 14, padding: 14, marginTop: 8 },
  noteText: { fontSize: 13, lineHeight: 19 },
});
