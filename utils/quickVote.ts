import AsyncStorage from '@react-native-async-storage/async-storage';
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
  aiOverview?: { summaryGoodBad?: string };
  rating?: number;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  priceRange?: unknown;
  priceLevel?: string;
  distanceMeters?: number;
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

  return all;
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
  const raw = r.gemini_summary ?? r.aiOverview?.summaryGoodBad ?? '';
  const line = raw.split('\n')[0]?.trim() ?? '';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}
