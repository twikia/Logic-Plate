// ─── Free Brand-Based Price Tier Priors ───────────────────────────────────────
// Overture rarely includes a price tier/tag. For well-known chains we can infer
// price tier deterministically from the brand name at zero cost, instead of
// leaving it null or paying for an AI call just to guess "$" vs "$$$$".
// Tier: 1=budget, 2=moderate, 3=pricey, 4=fine dining.

const BRAND_PRICE_TIERS: Record<number, string[]> = {
  1: [
    'mcdonald', 'burger king', 'wendy', 'taco bell', 'kfc', 'popeyes',
    'subway', 'domino', 'pizza hut', 'little caesars', 'sonic drive',
    'dunkin', 'starbucks', 'chick-fil-a', 'chickfila', 'arby',
    'jack in the box', 'white castle', 'del taco', 'el pollo loco',
    'panda express', 'chipotle', 'qdoba', 'jimmy john', 'jersey mike',
    'wingstop', 'church\u2019s chicken', 'churchs chicken', 'zaxby',
    'raising cane', 'in-n-out', 'in n out', 'five guys', 'checkers',
    'rally\u2019s', 'rallys', 'whataburger', 'culver', 'sonic',
    'papa john', 'papa murphy', 'krispy kreme', 'baskin robbins',
    'dairy queen', 'ihop', 'waffle house', 'denny\u2019s', 'dennys',
    'panera', 'einstein bros', 'tim hortons', 'a&w', 'carl\u2019s jr',
    'carls jr', 'hardee', 'boston market', 'firehouse subs', 'blaze pizza',
    'moe\u2019s southwest', 'moes southwest',
  ],
  2: [
    'applebee', 'chili\u2019s', 'chilis', 'olive garden', 'red robin',
    'tgi friday', 'ruby tuesday', 'outback steakhouse', 'texas roadhouse',
    'cracker barrel', 'buffalo wild wings', 'red lobster', 'p.f. chang',
    'pf changs', 'cheesecake factory', 'california pizza kitchen',
    'bj\u2019s restaurant', 'bjs restaurant', 'ihop', 'denny\u2019s',
    'famous dave', 'longhorn steakhouse', 'first watch', 'yard house',
    'shake shack', 'noodles & company', 'noodles and company',
  ],
  3: [
    'ruth\u2019s chris', 'ruths chris', 'capital grille', 'flemings',
    'seasons 52', 'maggiano', 'morton\u2019s', 'mortons steakhouse',
    'del frisco', 'STK steakhouse', 'benihana',
  ],
  4: [
    'nobu', 'le bernardin', 'per se', 'eleven madison', 'daniel',
    'masa', 'the french laundry',
  ],
};

const FLAT_LOOKUP: Array<{ needle: string; tier: number }> = Object.entries(BRAND_PRICE_TIERS)
  .flatMap(([tier, names]) => names.map(needle => ({ needle, tier: Number(tier) })))
  .sort((a, b) => b.needle.length - a.needle.length); // longest/most-specific match first

/**
 * Returns a deterministic price tier (1-4) if the place name matches a known
 * chain/brand, otherwise null. Free — no network call, no AI usage.
 */
export function lookupBrandPriceTier(name: string | null | undefined): number | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  for (const { needle, tier } of FLAT_LOOKUP) {
    if (normalized.includes(needle)) return tier;
  }
  return null;
}
