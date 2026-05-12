import { CuisineImageStrip } from '@/components/CuisineImageStrip';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppTheme } from '@/context/ThemeContext';
import {
  SCENARIO_LABELS,
  SCENARIO_ORDER,
  type ScenarioKey,
} from '@/core/scenarioFilters';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MoodRow = { id: string; scenario: ScenarioKey };

const moods: MoodRow[] = SCENARIO_ORDER.map((scenario, i) => ({
  id: String(i + 1),
  scenario,
}));

const STRIP_SOURCES: Record<
  ScenarioKey,
  readonly [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType, ImageSourcePropType]
> = {
  healthiest: [
    require('../../../assets/feeling/smoothies_1.jpg'),
    require('../../../assets/feeling/smoothies_2.jpg'),
    require('../../../assets/feeling/smoothies_3.jpg'),
    require('../../../assets/feeling/smoothies_4.jpg'),
  ],
  workplace: [
    require('../../../assets/feeling/cafe_1.jpg'),
    require('../../../assets/feeling/cafe_2.jpg'),
    require('../../../assets/feeling/cafe_3.jpg'),
    require('../../../assets/feeling/cafe_4.jpg'),
  ],
  quick_bites: [
    require('../../../assets/feeling/american_1.jpg'),
    require('../../../assets/feeling/american_2.jpg'),
    require('../../../assets/feeling/american_3.jpg'),
    require('../../../assets/feeling/american_4.jpg'),
  ],
  date_night: [
    require('../../../assets/feeling/italian_1.jpg'),
    require('../../../assets/feeling/italian_2.jpg'),
    require('../../../assets/feeling/italian_3.jpg'),
    require('../../../assets/feeling/italian_4.jpg'),
  ],
  vegetarian_forward: [
    require('../../../assets/feeling/mediterranean_1.jpg'),
    require('../../../assets/feeling/mediterranean_2.jpg'),
    require('../../../assets/feeling/mediterranean_3.jpg'),
    require('../../../assets/feeling/mediterranean_4.jpg'),
  ],
  comfort_classics: [
    require('../../../assets/feeling/pizza_1.jpg'),
    require('../../../assets/feeling/pizza_2.jpg'),
    require('../../../assets/feeling/pizza_3.jpg'),
    require('../../../assets/feeling/pizza_4.jpg'),
  ],
};

const MoodCard = ({
  item,
  stripActive,
}: {
  item: MoodRow;
  stripActive: boolean;
}) => {
  const router = useRouter();
  const { theme } = useAppTheme();
  const sources = STRIP_SOURCES[item.scenario];
  const label = SCENARIO_LABELS[item.scenario];
  return (
    <AnimatedPressable
      style={[
        styles.card,
        {
          backgroundColor: theme.glassBackground,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
      ]}
      onPress={() => {
        router.push({
          pathname: '/random',
          params: { scenario: item.scenario },
        });
      }}
    >
      <CuisineImageStrip sources={sources} isActive={stripActive} />
      <View style={styles.cardBottom}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{label}</Text>
        <IconSymbol name="chevron.right" size={24} color={theme.subtext} />
      </View>
    </AnimatedPressable>
  );
};

export default function PickCategoriesScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(() => new Set());

  const onViewableItemsChanged = React.useRef(
    ({
      viewableItems,
    }: {
      viewableItems: { item: MoodRow; isViewable?: boolean }[];
    }) => {
      setVisibleIds(
        new Set(
          viewableItems.filter((v) => v.isViewable !== false).map((v) => v.item.id)
        )
      );
    }
  ).current;

  const viewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 40, minimumViewTime: 64 }),
    []
  );

  const renderItem = ({ item, index }: { item: MoodRow; index: number }) => (
    <MoodCard
      item={item}
      stripActive={
        visibleIds.size === 0 ? index < 5 : visibleIds.has(item.id)
      }
    />
  );

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </AnimatedPressable>
          <Text style={[styles.headerText, { color: theme.text }]}>Try something specific</Text>
        </View>

        <FlatList
          data={moods}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingVertical: 12,
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 15,
  },
  card: {
    borderRadius: 20,
    padding: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingTop: 4,
    gap: 12,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
});
