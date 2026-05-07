import { CuisineImageStrip } from '@/components/CuisineImageStrip';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAppTheme } from '@/context/ThemeContext';
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

const cuisines = [
  { id: '2', name: 'Mexican', key: 'mexican' },
  { id: '5', name: 'American', key: 'american' },
  { id: '13', name: 'Pizza', key: 'pizza' },
  { id: '17', name: 'Asian', key: 'asian' },
  { id: '16', name: 'Dessert', key: 'dessert' },
  { id: '6', name: 'Indian', key: 'indian' },
  { id: '8', name: 'Mediterranean', key: 'mediterranean' },
  { id: '1', name: 'Italian', key: 'italian' },
  { id: '12', name: 'Cafe', key: 'cafe' },
  { id: '14', name: 'Bars', key: 'bars' },
  { id: '15', name: 'Smoothie Shakes', key: 'smoothies' },
  { id: '99', name: 'Other', key: 'other' },
];

type CuisineRow = (typeof cuisines)[number];

const LOCAL_IMAGES: Record<
  CuisineRow['key'],
  readonly [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType, ImageSourcePropType]
> = {
  italian: [
    require('../../../assets/feeling/italian_1.jpg'),
    require('../../../assets/feeling/italian_2.jpg'),
    require('../../../assets/feeling/italian_3.jpg'),
    require('../../../assets/feeling/italian_4.jpg'),
  ],
  mexican: [
    require('../../../assets/feeling/mexican_1.jpg'),
    require('../../../assets/feeling/mexican_2.jpg'),
    require('../../../assets/feeling/mexican_3.jpg'),
    require('../../../assets/feeling/mexican_4.jpg'),
  ],
  american: [
    require('../../../assets/feeling/american_1.jpg'),
    require('../../../assets/feeling/american_2.jpg'),
    require('../../../assets/feeling/american_3.jpg'),
    require('../../../assets/feeling/american_4.jpg'),
  ],
  pizza: [
    require('../../../assets/feeling/pizza_1.jpg'),
    require('../../../assets/feeling/pizza_2.jpg'),
    require('../../../assets/feeling/pizza_3.jpg'),
    require('../../../assets/feeling/pizza_4.jpg'),
  ],
  asian: [
    require('../../../assets/feeling/asian_1.jpg'),
    require('../../../assets/feeling/asian_2.jpg'),
    require('../../../assets/feeling/asian_3.jpg'),
    require('../../../assets/feeling/asian_4.jpg'),
  ],
  dessert: [
    require('../../../assets/feeling/dessert_1.jpg'),
    require('../../../assets/feeling/dessert_2.jpg'),
    require('../../../assets/feeling/dessert_3.jpg'),
    require('../../../assets/feeling/dessert_4.jpg'),
  ],
  indian: [
    require('../../../assets/feeling/indian_1.jpg'),
    require('../../../assets/feeling/indian_2.jpg'),
    require('../../../assets/feeling/indian_3.jpg'),
    require('../../../assets/feeling/indian_4.jpg'),
  ],
  mediterranean: [
    require('../../../assets/feeling/mediterranean_1.jpg'),
    require('../../../assets/feeling/mediterranean_2.jpg'),
    require('../../../assets/feeling/mediterranean_3.jpg'),
    require('../../../assets/feeling/mediterranean_4.jpg'),
  ],
  cafe: [
    require('../../../assets/feeling/cafe_1.jpg'),
    require('../../../assets/feeling/cafe_2.jpg'),
    require('../../../assets/feeling/cafe_3.jpg'),
    require('../../../assets/feeling/cafe_4.jpg'),
  ],
  bars: [
    require('../../../assets/feeling/bars_1.jpg'),
    require('../../../assets/feeling/bars_2.jpg'),
    require('../../../assets/feeling/bars_3.jpg'),
    require('../../../assets/feeling/bars_4.jpg'),
  ],
  smoothies: [
    require('../../../assets/feeling/smoothies_1.jpg'),
    require('../../../assets/feeling/smoothies_2.jpg'),
    require('../../../assets/feeling/smoothies_3.jpg'),
    require('../../../assets/feeling/smoothies_4.jpg'),
  ],
  other: [
    require('../../../assets/feeling/other_1.jpg'),
    require('../../../assets/feeling/other_2.jpg'),
    require('../../../assets/feeling/other_3.jpg'),
    require('../../../assets/feeling/other_4.jpg'),
  ],
};

const CuisineCard = ({
  item,
  stripActive,
}: {
  item: CuisineRow;
  stripActive: boolean;
}) => {
  const router = useRouter();
  const { theme } = useAppTheme();
  const sources = LOCAL_IMAGES[item.key];
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
        if (item.key === 'other') {
          router.push('/random');
          return;
        }
        router.push({
          pathname: '/cuisine-results',
          params: { cuisine: item.name, cuisineKey: item.key },
        });
      }}
    >
      <CuisineImageStrip sources={sources} isActive={stripActive} />
      <View style={styles.cardBottom}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name}</Text>
        <IconSymbol name="chevron.right" size={24} color={theme.subtext} />
      </View>
    </AnimatedPressable>
  );
};

export default function FeelingScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(() => new Set());

  const onViewableItemsChanged = React.useRef(
    ({
      viewableItems,
    }: {
      viewableItems: { item: CuisineRow; isViewable?: boolean }[];
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

  const renderItem = ({ item, index }: { item: CuisineRow; index: number }) => (
    <CuisineCard
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
          <Text style={[styles.headerText, { color: theme.text }]}>What are you craving?</Text>
        </View>

        <FlatList
          data={cuisines}
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingVertical: 12,
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
