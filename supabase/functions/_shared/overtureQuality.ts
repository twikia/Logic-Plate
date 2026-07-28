/** Hard quality gates for Overture places (edge). No AI — deterministic cutoffs only. */

export const MIN_OVERTURE_CONFIDENCE = 0.9;
export const MIN_OVERTURE_CONFIDENCE_META_ONLY = 0.95;
export const MIN_EXISTENCE_SIGNALS = 3;
export const CELL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const FOOD_CATEGORIES = [
  'restaurant',
  'fast_food_restaurant',
  'cafe',
  'coffee_shop',
  'tea_house',
  'bar',
  'cocktail_bar',
  'lounge',
  'night_club',
  'wine_bar',
  'pub',
  'beer_garden',
  'sports_bar',
  'brewery',
  'pizza_restaurant',
  'hamburger_restaurant',
  'sandwich_shop',
  'hot_dog_restaurant',
  'food_court',
  'food_truck',
  'deli',
  'bagel_shop',
  'ice_cream_shop',
  'bakery',
  'dessert_shop',
  'dessert_restaurant',
  'donut_shop',
  'candy_store',
  'steak_house',
  'fine_dining_restaurant',
  'buffet_restaurant',
  'diner',
  'seafood_restaurant',
  'american_restaurant',
  'barbecue_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'italian_restaurant',
  'japanese_restaurant',
  'sushi_restaurant',
  'ramen_restaurant',
  'poke_restaurant',
  'korean_restaurant',
  'chinese_restaurant',
  'vietnamese_restaurant',
  'thai_restaurant',
  'indian_restaurant',
  'mexican_restaurant',
  'mediterranean_restaurant',
  'greek_restaurant',
  'middle_eastern_restaurant',
  'lebanese_restaurant',
  'turkish_restaurant',
  'french_restaurant',
  'spanish_restaurant',
  'tapas_restaurant',
  'chicken_restaurant',
  'health_food_restaurant',
  'salad_shop',
  'vegetarian_restaurant',
  'vegan_restaurant',
  'juice_shop',
  'acai_shop',
  'smoothie_bar',
  'food_and_drink',
  'meal_takeaway',
  'meal_delivery',
] as const;

const FOOD_CATEGORY_SET = new Set<string>(FOOD_CATEGORIES);

const FOOD_BASIC_EXTRA = new Set([
  'casual_eatery',
  'fine_dining',
  'fast_food',
  'coffee_shop',
  'tea_house',
  'dessert',
  'bakery',
  'bar',
  'pub',
  'brewery',
  'winery',
  'distillery',
  'nightclub',
  'food_truck',
  'ice_cream',
  'juice_bar',
]);

const TRUSTED_DATASETS = new Set([
  'foursquare',
  'alltheplaces',
  'brightquery',
  'pinmeto',
  'microsoft',
  'dac',
  'krick',
  'renderseo',
]);

const META_DATASETS = new Set(['meta', 'facebook']);

const SOCIAL_HOSTS =
  /(?:facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|yelp|tripadvisor|doordash|ubereats|grubhub)\./i;

const NON_FOOD_NAME_RE =
  /\b(barber|barbershop|barber\s*shop|hair\s*salon|nail\s*salon|nails?\s*spa|day\s*spa|tattoo|piercing|church|mosque|synagogue|temple|dentist|dental|chiropract|lawyer|attorney|realtor|real\s*estate|auto\s*repair|car\s*wash|oil\s*change|gym\b|fitness\s*center|pharmacy|drugstore|bank\b|credit\s*union|laundromat|dry\s*clean|hardware\s*store|furniture\s*store|mattress|insurance\s*agency)\b/i;

export type QualityRejectReason =
  | 'no_website'
  | 'low_confidence'
  | 'permanently_closed'
  | 'unknown_status'
  | 'weak_existence'
  | 'bad_category'
  | 'non_food_name'
  | 'meta_only_weak'
  | 'bad_location';

export type SourceRef = { property?: string; dataset?: string; record_id?: string };

export type PlaceQualityInput = {
  name: string;
  category?: string | null;
  website_url?: string | null;
  phone?: string | null;
  address?: string | null;
  operating_status?: string | null;
  businessStatus?: string | null;
  confidence?: number | null;
  sources?: SourceRef[] | null;
  categoryLabels?: string[];
};

function normalizeDataset(raw: string | undefined | null): string {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '');
}

export function isSocialOrDeliveryUrl(url: string): boolean {
  return SOCIAL_HOSTS.test(url);
}

export function hasRealAddress(address?: string | null): boolean {
  const a = String(address || '').trim();
  if (a.length < 5) return false;
  return /\d/.test(a) || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place)\b/i.test(a);
}

export function collectDatasets(sources?: SourceRef[] | null): string[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const d = normalizeDataset(s?.dataset);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

export function isMetaOnlySources(sources?: SourceRef[] | null): boolean {
  const datasets = collectDatasets(sources);
  if (datasets.length === 0) return true;
  return datasets.every((d) => META_DATASETS.has(d));
}

export function hasTrustedSource(sources?: SourceRef[] | null): boolean {
  return collectDatasets(sources).some((d) => TRUSTED_DATASETS.has(d));
}

export function hasMultiProviderSources(sources?: SourceRef[] | null): boolean {
  const datasets = collectDatasets(sources);
  if (datasets.length >= 2) return true;
  return hasTrustedSource(sources) && datasets.length >= 1;
}

export function isFoodCategoryLabel(label: string | null | undefined): boolean {
  const c = String(label || '')
    .toLowerCase()
    .trim();
  if (!c) return false;
  if (FOOD_CATEGORY_SET.has(c) || FOOD_BASIC_EXTRA.has(c)) return true;
  if (c === 'food_and_drink' || c.startsWith('food_and_drink')) return true;
  if (
    /restaurant|food_truck|food_court|meal_takeaway|meal_delivery|bakery|cafe|coffee|bistro|diner|pizzeria|steakhouse|barbecue|bbq|sushi|ramen|noodle|tavern|gastropub|brewery|winery|distillery|juice|smoothie|dessert|donut|bagel|deli|sandwich|burger|taco|ice_cream|gelato|pub|bar$|_bar$|^bar_|night_?club|lounge/.test(
      c,
    )
  ) {
    return true;
  }
  return false;
}

export function isFoodCategoryLabels(labels: Array<string | null | undefined>): boolean {
  return labels.some((l) => isFoodCategoryLabel(l));
}

export function hasNonFoodName(name: string): boolean {
  return NON_FOOD_NAME_RE.test(String(name || ''));
}

export function minConfidenceForSources(sources?: SourceRef[] | null): number {
  return isMetaOnlySources(sources)
    ? MIN_OVERTURE_CONFIDENCE_META_ONLY
    : MIN_OVERTURE_CONFIDENCE;
}

export function countExistenceSignals(place: PlaceQualityInput): number {
  let n = 0;
  if (place.website_url && !isSocialOrDeliveryUrl(place.website_url)) n += 1;
  if (
    typeof place.confidence === 'number' &&
    Number.isFinite(place.confidence) &&
    place.confidence >= minConfidenceForSources(place.sources)
  ) {
    n += 1;
  }
  if (place.phone && String(place.phone).trim().length >= 7) n += 1;
  if (hasRealAddress(place.address)) n += 1;
  if (String(place.operating_status || '').toLowerCase() === 'open') n += 1;
  if (hasMultiProviderSources(place.sources)) n += 1;
  return n;
}

export function evaluatePlaceQuality(
  place: PlaceQualityInput,
): { ok: true } | { ok: false; reason: QualityRejectReason } {
  const website = place.website_url?.trim() || '';
  if (!website || isSocialOrDeliveryUrl(website)) {
    return { ok: false, reason: 'no_website' };
  }

  if (hasNonFoodName(place.name)) {
    return { ok: false, reason: 'non_food_name' };
  }

  const labels =
    place.categoryLabels && place.categoryLabels.length > 0
      ? place.categoryLabels
      : [place.category];
  const primary = labels[0];
  if (!isFoodCategoryLabel(primary)) {
    return { ok: false, reason: 'bad_category' };
  }

  const operating = String(place.operating_status || '').toLowerCase();
  const business = String(place.businessStatus || '').toUpperCase();
  if (operating === 'permanently_closed' || business === 'CLOSED_PERMANENTLY') {
    return { ok: false, reason: 'permanently_closed' };
  }
  if (operating !== 'open') {
    return { ok: false, reason: 'unknown_status' };
  }

  const confidence = place.confidence;
  const minConf = minConfidenceForSources(place.sources);
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < minConf) {
    return { ok: false, reason: 'low_confidence' };
  }

  if (isMetaOnlySources(place.sources)) {
    const phoneOk = !!(place.phone && String(place.phone).trim().length >= 7);
    const addressOk = hasRealAddress(place.address);
    if (!phoneOk || !addressOk || confidence < MIN_OVERTURE_CONFIDENCE_META_ONLY) {
      return { ok: false, reason: 'meta_only_weak' };
    }
  }

  if (countExistenceSignals(place) < MIN_EXISTENCE_SIGNALS) {
    return { ok: false, reason: 'weak_existence' };
  }

  return { ok: true };
}
