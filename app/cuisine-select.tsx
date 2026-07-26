import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/soundPressable';
import { useAppTheme } from '@/context/ThemeContext';
import { TOP_CUISINE_TILES } from '@/core/recommendationCuisines';
import { tCuisineLabel } from '@/core/i18nLabels';
import { useRouter } from 'expo-router';
import { hapticLight } from '@/core/haptics';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/ui/BackButton';

export default function CuisineSelectScreen() {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} size={28} />
          <Text style={[styles.title, { color: theme.text }]}>
            {t('scenarios.selectByCuisine', { defaultValue: 'Select by Cuisine' })}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          {t('scenarios.selectByCuisineHint', { defaultValue: 'Tap a cuisine to filter nearby spots' })}
        </Text>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.grid}>
            {TOP_CUISINE_TILES.map(tile => (
              <Pressable
                key={tile.id}
                onPress={() => {
                  hapticLight();
                  router.replace({ pathname: '/random', params: { cuisine: tile.id } });
                }}
                style={[
                  styles.tile,
                  { borderColor: theme.cardBorderColor, backgroundColor: theme.glassBackground },
                ]}
              >
                <Text style={styles.emoji}>{tile.emoji}</Text>
                <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>
                  {tCuisineLabel(tile.id)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
    lineHeight: 20,
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  tile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
  },
  emoji: { fontSize: 28, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
