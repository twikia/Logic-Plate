import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import { useAppTheme } from '@/context/ThemeContext';
import { SCENARIO_ORDER, SCENARIO_EMOJIS } from '@/core/scenarioFilters';
import { scenarioGradientLayout } from '@/core/scenarioGradientLayout';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { hapticLight } from '@/core/haptics';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/ui/BackButton';
import { Ionicons } from '@expo/vector-icons';

export default function ScenariosScreen() {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const neon = Boolean(theme.neonColors);

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} size={28} />
          <Text style={[styles.title, { color: theme.text }]}>{t('scenarios.moreFilters', { defaultValue: 'More Filters' })}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.cuisineEntry,
              neon
                ? { backgroundColor: 'rgba(0,255,255,0.08)', borderColor: 'rgba(0,255,255,0.28)' }
                : { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor },
            ]}
            onPress={() => {
              hapticLight();
              router.push('/cuisine-select' as any);
            }}
          >
            <View style={styles.cuisineEntryLeft}>
              <Text style={styles.cuisineEntryEmoji}>🍜</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.cuisineEntryTitle, { color: theme.text }]}>
                  {t('scenarios.selectByCuisine', { defaultValue: 'Select by Cuisine' })}
                </Text>
                <Text style={[styles.cuisineEntryHint, { color: theme.subtext }]}>
                  {t('scenarios.selectByCuisineHint', { defaultValue: 'Tap a cuisine to filter nearby spots' })}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color={neon ? '#00FFFF' : theme.accent} />
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { color: theme.subtext }]}>
            {t('scenarios.vibesSection', { defaultValue: 'Vibes & moods' })}
          </Text>

          <View style={styles.grid}>
            {SCENARIO_ORDER.map(scenario => {
              const gradLayout = scenarioGradientLayout(scenario);
              const neonColors = theme.neonColors;
              const inner = <Text style={styles.emoji}>{SCENARIO_EMOJIS[scenario]}</Text>;

              return (
                <TouchableOpacity
                  key={scenario}
                  activeOpacity={0.82}
                  style={styles.chipWrap}
                  onPress={() => {
                    hapticLight();
                    router.replace({ pathname: '/random', params: { scenario } });
                  }}
                >
                  {neon && neonColors ? (
                    <LinearGradient
                      colors={neonColors}
                      start={gradLayout.start}
                      end={gradLayout.end}
                      style={styles.circleNeonGrad}
                    >
                      <View style={[styles.circleNeonInner, { backgroundColor: theme.cardBackground }]}>
                        {inner}
                      </View>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.circle, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}>
                      {inner}
                    </View>
                  )}
                  <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
                    {t(`scenarios.${scenario}`, { defaultValue: scenario })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const CIRCLE_SIZE = 64;

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  cuisineEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 22,
    gap: 10,
  },
  cuisineEntryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cuisineEntryEmoji: {
    fontSize: 30,
  },
  cuisineEntryTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  cuisineEntryHint: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  chipWrap: {
    alignItems: 'center',
    width: 80,
    gap: 8,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleNeonGrad: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    padding: 1.5,
  },
  circleNeonInner: {
    flex: 1,
    borderRadius: CIRCLE_SIZE / 2 - 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 32 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
    width: '100%',
  },
});
