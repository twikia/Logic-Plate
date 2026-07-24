import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { useAppTheme } from '@/context/ThemeContext';
import { setCurrentRestaurant } from '@/core/currentSelection';
import { hydrateFavoritePlace } from '@/core/fetchPlaceById';
import {
  loadFavorites,
  removeFavorite,
  subscribeFavorites,
  type FavoritePlace,
} from '@/core/favorites';
import { getPlaceAddress, getPlaceName } from '@/core/placeFields';
import { hapticMedium } from '@/core/haptics';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity } from '@/components/ui/soundPressable';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FavoritesScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState<FavoritePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadFavorites();
    setItems(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeFavorites(() => {
      void refresh();
    });
  }, [refresh]);

  const openFavorite = useCallback(
    async (item: FavoritePlace) => {
      if (openingId) return;
      setOpeningId(item.id);
      hapticMedium();
      try {
        const hydrated = await hydrateFavoritePlace(item.place);
        setCurrentRestaurant(hydrated);
        Image.clearMemoryCache();
        router.push('/random-result');
      } finally {
        setOpeningId(null);
      }
    },
    [openingId, router]
  );

  const onRemove = useCallback(async (placeId: string) => {
    hapticMedium();
    await removeFavorite(placeId);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.cardBackground }]}>
      <TopProfileButton />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: theme.glassBackground, borderColor: theme.cardBorderColor }]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('favorites.title', { defaultValue: 'Favorites' })}
          </Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="heart-outline" size={48} color={theme.subtext} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              {t('favorites.empty', {
                defaultValue: 'No favorites yet. Tap the heart on a restaurant to save it.',
              })}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const name = getPlaceName(item.place);
              const address = getPlaceAddress(item.place);
              const busy = openingId === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.glassBackground,
                      borderColor: theme.cardBorderColor,
                    },
                  ]}
                  onPress={() => void openFavorite(item)}
                  disabled={!!openingId}
                >
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    {address ? (
                      <Text style={[styles.rowSub, { color: theme.subtext }]} numberOfLines={2}>
                        {address}
                      </Text>
                    ) : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => void onRemove(item.id)}
                      hitSlop={10}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="heart" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowSub: { fontSize: 13, lineHeight: 18 },
  removeBtn: { padding: 4 },
});
