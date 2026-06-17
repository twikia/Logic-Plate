type Money = { units?: string | number; nanos?: number; currencyCode?: string };

function moneyToNumber(m?: Money): number | null {
  if (!m) return null;
  const raw = m.units;
  const u =
    typeof raw === 'string'
      ? parseFloat(raw)
      : typeof raw === 'number'
        ? raw
        : NaN;
  if (!Number.isFinite(u)) return null;
  const nanos = typeof m.nanos === 'number' ? m.nanos / 1e9 : 0;
  return u + nanos;
}

function normalizeMoney(raw: unknown): Money | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const units = m.units;
  const currencyCode = m.currencyCode ?? m.currency_code;
  return {
    units: typeof units === 'string' || typeof units === 'number' ? units : undefined,
    nanos: typeof m.nanos === 'number' ? m.nanos : undefined,
    currencyCode: typeof currencyCode === 'string' ? currencyCode : undefined,
  };
}

function normalizePriceRange(raw: unknown): { startPrice?: Money; endPrice?: Money } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const pr = raw as Record<string, unknown>;
  const startPrice = normalizeMoney(pr.startPrice ?? pr.start_price);
  const endPrice = normalizeMoney(pr.endPrice ?? pr.end_price);
  if (!startPrice && !endPrice) return undefined;
  return { startPrice, endPrice };
}

function formatMoneyAmount(amount: number, currencyCode: string): string {
  const useDecimals = Math.abs(amount - Math.round(amount)) > 1e-6;
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: useDecimals ? 2 : 0,
  });
  return fmt.format(amount);
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
  priceRange?: { startPrice?: Money; endPrice?: Money } | unknown;
}): string {
  const pr = normalizePriceRange(place.priceRange);
  if (!pr) return '';
  const code = pr.startPrice?.currencyCode || pr.endPrice?.currencyCode || 'USD';
  const start = moneyToNumber(pr.startPrice);
  const end = moneyToNumber(pr.endPrice);
  if (start == null && end == null) return '';
  try {
    if (start != null && end != null) {
      if (Math.abs(start - end) < 0.005) return formatMoneyAmount(start, code);
      return `${formatMoneyAmount(start, code)}–${formatMoneyAmount(end, code)}`;
    }
    if (start != null) return `${formatMoneyAmount(start, code)}+`;
    if (end != null) return `<${formatMoneyAmount(end, code)}`;
    return '';
  } catch {
    return '';
  }
}
