import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'recommendation_visit_history_v1';

export type VisitRecord = {
  placeId: string;
  primaryType: string;
  ts: number;
};

type Stored = { v: 1; visits: VisitRecord[] };

const MAX = 200;

export async function appendVisit(placeId: string, primaryType: string): Promise<void> {
  if (!placeId) return;
  const list = await loadVisitsRaw();
  list.push({ placeId, primaryType: primaryType || '', ts: Date.now() });
  const trimmed = list.slice(-MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, visits: trimmed } satisfies Stored));
}

export async function loadVisits(): Promise<VisitRecord[]> {
  return loadVisitsRaw();
}

async function loadVisitsRaw(): Promise<VisitRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as Stored;
    if (p?.v !== 1 || !Array.isArray(p.visits)) return [];
    return p.visits.filter(v => v && typeof v.placeId === 'string');
  } catch {
    return [];
  }
}

export function wasPlaceVisitedRecently(
  visits: VisitRecord[],
  placeId: string,
  windowDays: number
): boolean {
  const cutoff = Date.now() - windowDays * 86400000;
  return visits.some(v => v.placeId === placeId && v.ts >= cutoff);
}

export function wasCuisineVisitedRecently(
  visits: VisitRecord[],
  primaryType: string,
  windowDays: number
): boolean {
  if (!primaryType) return false;
  const cutoff = Date.now() - windowDays * 86400000;
  return visits.some(v => v.primaryType === primaryType && v.ts >= cutoff);
}
