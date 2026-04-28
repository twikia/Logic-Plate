import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import {  StyleSheet, Text, View, FlatList, Image, Pressable  } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

const cuisines = [
  { id: '1', name: 'Italian', images: [
      'https://loremflickr.com/400/400/italian,food/all?lock=1',
      'https://loremflickr.com/400/400/italian,food/all?lock=2',
      'https://loremflickr.com/400/400/italian,food/all?lock=3'
  ]},
  { id: '2', name: 'Mexican', images: [
      'https://loremflickr.com/400/400/mexican,food/all?lock=1',
      'https://loremflickr.com/400/400/mexican,food/all?lock=2',
      'https://loremflickr.com/400/400/mexican,food/all?lock=3'
  ]},
  { id: '3', name: 'Japanese', images: [
      'https://loremflickr.com/400/400/japanese,food/all?lock=1',
      'https://loremflickr.com/400/400/japanese,food/all?lock=2',
      'https://loremflickr.com/400/400/japanese,food/all?lock=3'
  ]},
  { id: '4', name: 'Chinese', images: [
      'https://loremflickr.com/400/400/chinese,food/all?lock=1',
      'https://loremflickr.com/400/400/chinese,food/all?lock=2',
      'https://loremflickr.com/400/400/chinese,food/all?lock=3'
  ]},
  { id: '5', name: 'American', images: [
      'https://loremflickr.com/400/400/burger,food/all?lock=1',
      'https://loremflickr.com/400/400/burger,food/all?lock=2',
      'https://loremflickr.com/400/400/burger,food/all?lock=3'
  ]},
  { id: '6', name: 'Indian', images: [
      'https://loremflickr.com/400/400/indian,food/all?lock=1',
      'https://loremflickr.com/400/400/indian,food/all?lock=2',
      'https://loremflickr.com/400/400/indian,food/all?lock=3'
  ]},
  { id: '7', name: 'Thai', images: [
      'https://loremflickr.com/400/400/thai,food/all?lock=1',
      'https://loremflickr.com/400/400/thai,food/all?lock=2',
      'https://loremflickr.com/400/400/thai,food/all?lock=3'
  ]},
  { id: '8', name: 'Mediterranean', images: [
      'https://loremflickr.com/400/400/mediterranean,food/all?lock=1',
      'https://loremflickr.com/400/400/mediterranean,food/all?lock=2',
      'https://loremflickr.com/400/400/mediterranean,food/all?lock=3'
  ]},
  { id: '12', name: 'Cafe', images: [
      'https://loremflickr.com/400/400/cafe,coffee/all?lock=1',
      'https://loremflickr.com/400/400/cafe,coffee/all?lock=2',
      'https://loremflickr.com/400/400/cafe,coffee/all?lock=3'
  ]},
  { id: '14', name: 'Drinks & Smoothies', images: [
      'https://loremflickr.com/400/400/smoothie,drink/all?lock=1',
      'https://loremflickr.com/400/400/smoothie,drink/all?lock=2',
      'https://loremflickr.com/400/400/smoothie,drink/all?lock=3'
  ]},
  { id: '9', name: 'Seafood', images: [
      'https://loremflickr.com/400/400/seafood,food/all?lock=1',
      'https://loremflickr.com/400/400/seafood,food/all?lock=2',
      'https://loremflickr.com/400/400/seafood,food/all?lock=3'
  ]},
  { id: '10', name: 'Steakhouse', images: [
      'https://loremflickr.com/400/400/steak,food/all?lock=1',
      'https://loremflickr.com/400/400/steak,food/all?lock=2',
      'https://loremflickr.com/400/400/steak,food/all?lock=3'
  ]},
  { id: '11', name: 'Vegan', images: [
      'https://loremflickr.com/400/400/vegan,food/all?lock=1',
      'https://loremflickr.com/400/400/vegan,food/all?lock=2',
      'https://loremflickr.com/400/400/vegan,food/all?lock=3'
  ]},
  { id: '13', name: 'Pizza', images: [
      'https://loremflickr.com/400/400/pizza,food/all?lock=1',
      'https://loremflickr.com/400/400/pizza,food/all?lock=2',
      'https://loremflickr.com/400/400/pizza,food/all?lock=3'
  ]},
  { id: '99', name: 'Other', images: [
      'https://loremflickr.com/400/400/restaurant,food/all?lock=1',
      'https://loremflickr.com/400/400/restaurant,food/all?lock=2',
      'https://loremflickr.com/400/400/restaurant,food/all?lock=3'
  ]}
];

const CuisineCard = ({ item }: { item: typeof cuisines[0] }) => {
  const randomImage = React.useMemo(() => item.images[Math.floor(Math.random() * item.images.length)], [item.images]);
  return (
    <Pressable style={styles.card}>
      <Image source={{ uri: randomImage }} style={styles.cardImage} />
      <Text style={styles.cardTitle}>{item.name}</Text>
      <IconSymbol name="chevron.right" size={24} color="rgba(255, 255, 255, 0.5)" />
    </Pressable>
  );
};

export default function FeelingScreen() {
  const renderItem = ({ item }: { item: typeof cuisines[0] }) => (
    <CuisineCard item={item} />
  );

  return (
    <LinearGradient colors={['#5C255C', '#F9A06F']} style={styles.background}>
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
