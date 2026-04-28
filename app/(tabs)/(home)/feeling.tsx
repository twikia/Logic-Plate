import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { StyleSheet, Text, View, FlatList, Image } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

const LOCAL_IMAGES: Record<string, any[]> = {
  italian: [require('../../../assets/feeling/italian_1.jpg'), require('../../../assets/feeling/italian_2.jpg'), require('../../../assets/feeling/italian_3.jpg')],
  mexican: [require('../../../assets/feeling/mexican_1.jpg'), require('../../../assets/feeling/mexican_2.jpg'), require('../../../assets/feeling/mexican_3.jpg')],
  japanese: [require('../../../assets/feeling/japanese_1.jpg'), require('../../../assets/feeling/japanese_2.jpg'), require('../../../assets/feeling/japanese_3.jpg')],
  chinese: [require('../../../assets/feeling/chinese_1.jpg'), require('../../../assets/feeling/chinese_2.jpg'), require('../../../assets/feeling/chinese_3.jpg')],
  american: [require('../../../assets/feeling/american_1.jpg'), require('../../../assets/feeling/american_2.jpg'), require('../../../assets/feeling/american_3.jpg')],
  indian: [require('../../../assets/feeling/indian_1.jpg'), require('../../../assets/feeling/indian_2.jpg'), require('../../../assets/feeling/indian_3.jpg')],
  thai: [require('../../../assets/feeling/thai_1.jpg'), require('../../../assets/feeling/thai_2.jpg'), require('../../../assets/feeling/thai_3.jpg')],
  mediterranean: [require('../../../assets/feeling/mediterranean_1.jpg'), require('../../../assets/feeling/mediterranean_2.jpg'), require('../../../assets/feeling/mediterranean_3.jpg')],
  cafe: [require('../../../assets/feeling/cafe_1.jpg'), require('../../../assets/feeling/cafe_2.jpg'), require('../../../assets/feeling/cafe_3.jpg')],
  bars: [require('../../../assets/feeling/bars_1.jpg'), require('../../../assets/feeling/bars_2.jpg'), require('../../../assets/feeling/bars_3.jpg')],
  smoothies: [require('../../../assets/feeling/smoothies_1.jpg'), require('../../../assets/feeling/smoothies_2.jpg'), require('../../../assets/feeling/smoothies_3.jpg')],
  seafood: [require('../../../assets/feeling/seafood_1.jpg'), require('../../../assets/feeling/seafood_2.jpg'), require('../../../assets/feeling/seafood_3.jpg')],
  steakhouse: [require('../../../assets/feeling/steakhouse_1.jpg'), require('../../../assets/feeling/steakhouse_2.jpg'), require('../../../assets/feeling/steakhouse_3.jpg')],
  vegan: [require('../../../assets/feeling/vegan_1.jpg'), require('../../../assets/feeling/vegan_2.jpg'), require('../../../assets/feeling/vegan_3.jpg')],
  pizza: [require('../../../assets/feeling/pizza_1.jpg'), require('../../../assets/feeling/pizza_2.jpg'), require('../../../assets/feeling/pizza_3.jpg')],
  dessert: [require('../../../assets/feeling/dessert_1.jpg'), require('../../../assets/feeling/dessert_2.jpg'), require('../../../assets/feeling/dessert_3.jpg')],
  other: [require('../../../assets/feeling/other_1.jpg'), require('../../../assets/feeling/other_2.jpg'), require('../../../assets/feeling/other_3.jpg')]
};

const cuisines = [
  { id: '1', name: 'Italian', key: 'italian' },
  { id: '2', name: 'Mexican', key: 'mexican' },
  { id: '3', name: 'Japanese', key: 'japanese' },
  { id: '4', name: 'Chinese', key: 'chinese' },
  { id: '5', name: 'American', key: 'american' },
  { id: '6', name: 'Indian', key: 'indian' },
  { id: '7', name: 'Thai', key: 'thai' },
  { id: '8', name: 'Mediterranean', key: 'mediterranean' },
  { id: '16', name: 'Dessert', key: 'dessert' },
  { id: '12', name: 'Cafe', key: 'cafe' },
  { id: '14', name: 'Bars', key: 'bars' },
  { id: '15', name: 'Smoothie Shakes', key: 'smoothies' },
  { id: '9', name: 'Seafood', key: 'seafood' },
  { id: '10', name: 'Steakhouse', key: 'steakhouse' },
  { id: '11', name: 'Vegan', key: 'vegan' },
  { id: '13', name: 'Pizza', key: 'pizza' },
  { id: '99', name: 'Other', key: 'other' }
];

const CuisineCard = ({ item }: { item: typeof cuisines[0] }) => {
  const router = useRouter();
  const images = LOCAL_IMAGES[item.key as keyof typeof LOCAL_IMAGES];
  const randomImage = React.useMemo(() => images?.[Math.floor(Math.random() * images.length)], [images]);
  return (
    <AnimatedPressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/results', params: { cuisine: item.name, cuisineKey: item.key } })}
    >
      <Image source={randomImage} style={styles.cardImage} />
      <Text style={styles.cardTitle}>{item.name}</Text>
      <IconSymbol name="chevron.right" size={24} color="rgba(255, 255, 255, 0.5)" />
    </AnimatedPressable>
  );
};

export default function FeelingScreen() {
  const renderItem = ({ item }: { item: typeof cuisines[0] }) => (
    <CuisineCard item={item} />
  );

  return (
    <LinearGradient 
      colors={['#422046', '#FF9A6F']} 
      start={{ x: 0, y: 1 }} 
      end={{ x: 1, y: 0 }} 
      style={styles.background}
    >
      <Stack.Screen 
        options={{
          headerShown: false, // We will just use the transparent back button if needed, or hide header completely since it's nested
        }} 
      />
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.headerText}>What are you craving?</Text>
        <FlatList
          data={cuisines}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 15,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: 15,
    marginRight: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
});
