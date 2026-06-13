type Money = { units?: string | number; nanos?: number; currencyCode?: string };

function moneyToNumber(m?: Money): number | null {
  if (!m) return null;
  const raw = m.units;
  const u = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(u)) return null;
  const nanos = typeof m.nanos === 'number' ? m.nanos / 1e9 : 0;
  return u + nanos;
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

export function formatRestaurantCostLabel(place: {
  priceRange?: { startPrice?: Money; endPrice?: Money };
  priceLevel?: string | null;
}): string {
  return formatPlacePriceLabel(place) || formatPriceLevelLabel(place.priceLevel);
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
    const useDecimals = Math.abs(start - Math.round(start)) > 1e-6 || Math.abs(end - Math.round(end)) > 1e-6;
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
