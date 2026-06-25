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

export default function ScenariosScreen() {
  const { theme, themeName } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const neon = Boolean(theme.neonColors);

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} size={28} />
          <Text style={[styles.title, { color: theme.text }]}>More Filters</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
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
                    router.push({ pathname: '/random', params: { scenario } });
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
