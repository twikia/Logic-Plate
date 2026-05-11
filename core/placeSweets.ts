
const SWEETS_TYPE_PATTERN =
  /acai|bagel|bakery|candy|cake|chocolate|confection|cupcake|dessert|donut|frozen_yogurt|gelato|ice_cream|pastry|sweet|treat|yogurt_shop/i;

const SWEETS_PRIMARY_TYPES = new Set([
  'acai_shop',
  'bakery',
  'candy_store',
  'cake_shop',
  'chocolate_factory',
  'chocolate_shop',
  'confectionery',
  'dessert_restaurant',
  'dessert_shop',
  'donut_shop',
  'ice_cream_shop',
  'pastry_shop',
]);

export function placeOffersSweets(place: {
  primaryType?: string;
  types?: string[];
  servesDessert?: boolean;
  editorialSummary?: { text?: string };
  displayName?: { text?: string };
}): boolean {
  if (place?.servesDessert === true) return true;

  const primary = (place?.primaryType || '').toLowerCase();
  if (primary && SWEETS_PRIMARY_TYPES.has(primary)) return true;
  if (primary && SWEETS_TYPE_PATTERN.test(primary)) return true;

  for (const t of place?.types || []) {
    const tl = String(t).toLowerCase();
    if (SWEETS_PRIMARY_TYPES.has(tl)) return true;
    if (SWEETS_TYPE_PATTERN.test(tl)) return true;
  }

  const summary = (place?.editorialSummary?.text || '').toLowerCase();
  if (
    summary &&
    /dessert|bakery|sweet|pastry|cake|ice cream|gelato|chocolate|donut|candy|confection|cupcake|frozen yogurt/.test(summary)
  ) {
    return true;
  }

  const name = (place?.displayName?.text || '').toLowerCase();
  if (
    name &&
    /\b(bakery|desserts?|sweets?|gelato|frozen yogurt|ice cream|chocolat|donuts?|cupcakes?|candy|pastries)\b/.test(name)
  ) {
    return true;
  }

  return false;
}
