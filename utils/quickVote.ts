import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedAiOverviewsForPlaces, mergeAiOverviewsOntoPlaces } from '@/core/aiOverviewCache';
import { isOpenNow } from '@/core/isOpenNow';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface QuickVoteRestaurant {
  id: string;
  displayName?: { text?: string };
  primaryType?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  currentSecondaryOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularSecondaryOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photo_url?: string;
  gemini_summary?: string;
  healthScore?: number;
  aiOverview?: { summaryGoodBad?: string; healthScore?: number };
  rating?: number;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  priceRange?: unknown;
  priceLevel?: string;
  distanceMeters?: number;
  editorialSummary?: { text?: string };
}

const PRIMARY_TYPE_HEALTH_TIER: Record<string, number> = {
  japanese_restaurant: 5,
  sushi_restaurant: 5,
  vietnamese_restaurant: 5,
  mediterranean_restaurant: 4,
  greek_restaurant: 4,
  indian_restaurant: 4,
  mexican_restaurant: 3,
  italian_restaurant: 3,
  chinese_restaurant: 3,
  american_restaurant: 2,
  hamburger_restaurant: 1,
  pizza_restaurant: 2,
  fast_food_restaurant: 1,
};

export function healthTierFromPrimaryType(primaryType: string | undefined): number | null {
  if (!primaryType) return null;
  const tier = PRIMARY_TYPE_HEALTH_TIER[primaryType];
  if (tier == null) return null;
  return Math.min(10, Math.max(0, tier * 2));
}

function isProbablyOpen(r: QuickVoteRestaurant): boolean {
  if (r.currentOpeningHours?.openNow === true) return true;
  if (r.currentSecondaryOpeningHours?.openNow === true) return true;
  return isOpenNow(r);
}

export async function loadCachedRestaurants(): Promise<QuickVoteRestaurant[]> {
  const keys = await AsyncStorage.getAllKeys();
  const cellKeys = keys.filter((k) => k.startsWith('cell_'));
  const pairs = await AsyncStorage.multiGet(cellKeys);

  const all: QuickVoteRestaurant[] = [];
  const seen = new Set<string>();
  const now = Date.now();

  for (const [, value] of pairs) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value) as { restaurants?: QuickVoteRestaurant[]; fetched_at?: string };
      const fetchedAt = parsed.fetched_at ? new Date(parsed.fetched_at).getTime() : NaN;
      if (!Number.isFinite(fetchedAt) || now - fetchedAt > SEVEN_DAYS_MS) continue;
      for (const r of parsed.restaurants ?? []) {
        if (r?.id && !seen.has(r.id)) {
          seen.add(r.id);
          all.push(r);
        }
      }
    } catch {
      // skip malformed cache entries
    }
  }

  const ai = await getCachedAiOverviewsForPlaces(all);
  return mergeAiOverviewsOntoPlaces(all, ai);
}

export function pickQuickVoteRestaurants(all: QuickVoteRestaurant[]): QuickVoteRestaurant[] {
  const open = all.filter(isProbablyOpen);
  const pool = open.length >= 10 ? open : all;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  const seenTypes = new Set<string>();
  const picks: QuickVoteRestaurant[] = [];
  const overflow: QuickVoteRestaurant[] = [];

  for (const r of shuffled) {
    const pt = r.primaryType ?? 'unknown';
    if (!seenTypes.has(pt) && picks.length < 5) {
      picks.push(r);
      seenTypes.add(pt);
    } else {
      overflow.push(r);
    }
  }

  while (picks.length < 5 && overflow.length > 0) {
    const next = overflow.shift();
    if (next) picks.push(next);
  }

  return picks;
}

export function determineWinner(
  votes: Record<string, number>,
  restaurants: QuickVoteRestaurant[]
): QuickVoteRestaurant | null {
  if (Object.keys(votes).length === 0) return null;
  const winningId = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  return restaurants.find((r) => r.id === winningId) ?? null;
}

export function oneLineVibe(r: QuickVoteRestaurant): string {
  const raw =
    r.gemini_summary ??
    r.aiOverview?.summaryGoodBad ??
    r.editorialSummary?.text ??
    '';
  const line = raw.split('\n')[0]?.trim() ?? '';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
