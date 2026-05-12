import type { ScoredRestaurant } from './recommendationTypes';

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

export function pickSurpriseFromRanked(
  ranked: ScoredRestaurant[],
  excludeIds: ReadonlySet<string>,
  avoidPrimaryType?: string | null
): ScoredRestaurant | null {
  let pool = ranked.filter(r => {
    const id = String(r.place?.id || '');
    return id && !excludeIds.has(id);
  });
  if (pool.length === 0) return null;

  if (avoidPrimaryType) {
    const alt = pool.filter(r => String(r.place?.primaryType || '') !== avoidPrimaryType);
    if (alt.length > 0) pool = alt;
  }

  const cap = Math.min(20, pool.length);
  const top = pool.slice(0, cap);
  shuffleInPlace(top);
  return top[0] ?? null;
}
