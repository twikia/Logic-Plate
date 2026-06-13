export const MAX_CUISINE_RANKS = 5;

export function tapCuisineRank(current: string[], id: string): string[] {
  const idx = current.indexOf(id);
  if (idx >= 0) return current.filter(x => x !== id);
  if (current.length >= MAX_CUISINE_RANKS) return current;
  return [...current, id];
}

export function cuisineRankOf(ranked: string[], id: string): number | null {
  const idx = ranked.indexOf(id);
  return idx >= 0 ? idx + 1 : null;
}
