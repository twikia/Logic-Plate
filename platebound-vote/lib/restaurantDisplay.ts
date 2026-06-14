type Money = { units?: string | number; nanos?: number; currencyCode?: string };

type RestaurantPick = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  distanceMeters?: number;
  priceLevel?: string | null;
  priceRange?: { startPrice?: Money; endPrice?: Money };
  photos?: unknown[];
  photo_url?: string;
  gemini_summary?: string;
  aiOverview?: { summaryGoodBad?: string; healthScore?: number };
  healthScore?: number;
  groupScore?: number;
  editorialSummary?: { text?: string };
};

function moneyToNumber(m?: Money): number | null {
  if (!m) return null;
  const raw = m.units;
  const u = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(u)) return null;
  const nanos = typeof m.nanos === 'number' ? m.nanos / 1e9 : 0;
  return u + nanos;
}

export function formatPlacePriceLabel(place: {
  priceRange?: { startPrice?: Money; endPrice?: Money };
}): string {
  const pr = place.priceRange;
  const code = pr?.startPrice?.currencyCode || pr?.endPrice?.currencyCode || '';
  const start = moneyToNumber(pr?.startPrice);
  const end = moneyToNumber(pr?.endPrice);
  if (!code || start == null || end == null) return '';
  try {
    const useDecimals =
      Math.abs(start - Math.round(start)) > 1e-6 || Math.abs(end - Math.round(end)) > 1e-6;
    const fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: useDecimals ? 2 : 0,
    });
    if (Math.abs(start - end) < 0.005) return fmt.format(start);
    return `${fmt.format(start)}–${fmt.format(end)}`;
  } catch {
    return '';
  }
}

export function formatPriceLevelLabel(priceLevel?: string | null): string {
  switch (priceLevel) {
    case 'PRICE_LEVEL_FREE':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return '';
  }
}

export function formatRestaurantCostLabel(place: RestaurantPick): string {
  return formatPlacePriceLabel(place) || formatPriceLevelLabel(place.priceLevel);
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function oneLineSummary(r: RestaurantPick): string {
  const raw = r.gemini_summary ?? r.aiOverview?.summaryGoodBad ?? '';
  const line = raw.split('\n')[0]?.trim() ?? '';
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export function aiOverviewBody(r: RestaurantPick): string {
  const g = r.gemini_summary?.trim();
  if (g) return g;
  const s = r.aiOverview?.summaryGoodBad?.trim();
  if (s) return s;
  const ed = r.editorialSummary?.text?.trim();
  if (ed) return ed;
  return '';
}

export function pickPhotoUrl(r: RestaurantPick, cacheUrl?: string | null): string | null {
  if (cacheUrl) return cacheUrl;
  if (typeof r.photo_url === 'string' && r.photo_url.startsWith('http')) return r.photo_url;
  if (Array.isArray(r.photos)) {
    for (const photo of r.photos) {
      if (typeof photo === 'string' && photo.startsWith('http')) return photo;
      if (photo && typeof photo === 'object') {
        const obj = photo as Record<string, unknown>;
        for (const val of Object.values(obj)) {
          if (typeof val === 'string' && val.startsWith('http')) return val;
        }
      }
    }
  }
  return null;
}

export type { RestaurantPick };
