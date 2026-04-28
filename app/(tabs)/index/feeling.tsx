import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import {  StyleSheet, Text, View, FlatList, Image, Pressable  } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

const cuisines = [
  { id: '1', name: 'Italian', images: [
      'https://images.unsplash.com/photo-1498579150354-9794751d90ba?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '2', name: 'Mexican', images: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1584043720379-b56cd91b4cce?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '3', name: 'Japanese', images: [
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1580822184713-3644c5289863?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '4', name: 'Chinese', images: [
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1585032226651-759b368d7246?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '5', name: 'American', images: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1473093295043-cdd814d0e601?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '6', name: 'Indian', images: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1617692855027-33b14f061079?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '7', name: 'Thai', images: [
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1564834724105-918b73d1b9e0?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1626804475297-41609ae08bfe?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '8', name: 'Mediterranean', images: [
      'https://images.unsplash.com/photo-1544365558-35aa4afcf11f?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1580016480838-895ce495df02?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1562565652-a9e870c81363?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '9', name: 'Seafood', images: [
      'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1559742811-822873691df8?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '10', name: 'Steakhouse', images: [
      'https://images.unsplash.com/photo-1600891964092-4316c288032e?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1546964124-0cce460f38ef?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1558030006-450675393462?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '11', name: 'Vegan', images: [
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '12', name: 'Cafe', images: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1481833758786-ceed163e48fb?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '13', name: 'Pizza', images: [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?q=80&w=600&auto=format&fit=crop'
  ]},
  { id: '99', name: 'Other', images: [
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=600&auto=format&fit=crop'
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
