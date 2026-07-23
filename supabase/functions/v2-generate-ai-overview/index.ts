import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const FETCH_USER_AGENT = 'Platebound/2.0 (v2-ai-overview; contact: support@platebound.app)';
const MENU_KEYWORDS = ['menu', 'food', 'drink', 'dining', 'eat'];
const HOURS_KEYWORDS = ['hours', 'hour', 'opening', 'open-hours', 'schedule', 'contact', 'visit-us', 'location'];
const MAX_RELEVANT_TEXT_CHARS = 4_000;
const MAX_HOURS_TEXT_CHARS = 2_500;
const FETCH_TIMEOUT_MS = 7000;
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const MENU_SIGNAL_RE = /\$\d{1,3}(?:\.\d{2})?|\b\d{1,2}\.\d{2}\b|\b\d{1,3}\s*(?:USD|usd)\b/i;
const MENU_KEYWORD_RE = /\b(menu|appetizer|entree|entrée|dessert|salad|soup|sandwich|burger|pizza|pasta|steak|chicken|fish|seafood|taco|bowl|wrap|brunch|lunch|dinner|special|vegan|vegetarian|gluten|cocktail|wine|beer|beverage|side|platter|combo|sushi|ramen|bbq|grill|bistro|cafe|bakery)\b/i;
const HOURS_SIGNAL_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|midnight|noon|\b24\s*hours?\b|open\s+daily)\b/i;
const DAY_NAME_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const BOILERPLATE_RE = /\b(cookie|privacy policy|terms of (use|service)|subscribe|newsletter|follow us|all rights reserved|powered by|accessibility|sitemap|careers|press kit|opt.?out|gdpr|consent|manage preferences|sign up for|join our mailing)\b|©/i;
const SOCIAL_RE = /\b(instagram|facebook|twitter|tiktok|youtube|linkedin)\b/i;

// ─── Types ────────────────────────────────────────────────────────────────────

type InputPlace = {
  gers_id: string;
  name: string;
  website_url?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  category?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  phone?: string | null;
  price_tier?: number | null;
  operating_status?: string | null;
  regular_opening_hours?: { weekdayDescriptions: string[] } | null;
  attributes?: string[] | null;
};

type AiOverview = {
  summaryGoodBad: string;
  speedScore: number;
  healthScore: number;
  workoutRecoveryScore: number;
  processedScore: number;
  calorieScore: number;
  proteinScore: number;
  carbScore: number;
  dateWorthiness: number;
  noiseLevelEstimate: number;
  groupSizeSweetSpot: number;
  absoluteMacros: string;
  whoThisPlaceIsFor: string;
  tasteScore: number;
  valueForMoneyScore: number;
  hungoverRecoveryScore: number;
  munchyScore: number;
  varietyScore: number;
  macroFriendlyScore: number;
  soloDinerScore: number;
  energySustainScore: number;
  workFriendlyScore: number;
  // Unified menu + pricing (merged from generate-ai-menus)
  topMenuItems: Array<{ name: string; price: string; overview: string }>;
  priceTier: number;
  cuisineKey: string;
  weekdayDescriptions: string[];
};

type ScrapeResult = {
  menuText: string;
  hoursText: string;
  jsonLdWeekdayDescriptions: string[];
};

// ─── Gemini JSON Schema ───────────────────────────────────────────────────────

const overviewItemSchema = {
  type: 'OBJECT',
  properties: {
    gersId: { type: 'STRING' },
    summaryGoodBad: { type: 'STRING' },
    speedScore: { type: 'INTEGER' },
    healthScore: { type: 'NUMBER' },
    workoutRecoveryScore: { type: 'INTEGER' },
    processedScore: { type: 'INTEGER' },
    calorieScore: { type: 'INTEGER' },
    proteinScore: { type: 'INTEGER' },
    carbScore: { type: 'INTEGER' },
    dateWorthiness: { type: 'INTEGER' },
    noiseLevelEstimate: { type: 'INTEGER' },
    groupSizeSweetSpot: { type: 'INTEGER' },
    absoluteMacros: { type: 'STRING' },
    whoThisPlaceIsFor: { type: 'STRING' },
    tasteScore: { type: 'INTEGER' },
    valueForMoneyScore: { type: 'INTEGER' },
    hungoverRecoveryScore: { type: 'INTEGER' },
    munchyScore: { type: 'INTEGER' },
    varietyScore: { type: 'INTEGER' },
    macroFriendlyScore: { type: 'INTEGER' },
    soloDinerScore: { type: 'INTEGER' },
    energySustainScore: { type: 'INTEGER' },
    workFriendlyScore: { type: 'INTEGER' },
    topMenuItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          price: { type: 'STRING' },
          overview: { type: 'STRING' },
        },
        required: ['name', 'price', 'overview'],
      },
    },
    priceTier: { type: 'INTEGER' },
    cuisineKey: { type: 'STRING' },
    weekdayDescriptions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: [
    'gersId', 'summaryGoodBad', 'speedScore', 'healthScore', 'workoutRecoveryScore',
    'processedScore', 'calorieScore', 'proteinScore', 'carbScore', 'dateWorthiness',
    'noiseLevelEstimate', 'groupSizeSweetSpot', 'absoluteMacros', 'whoThisPlaceIsFor',
    'tasteScore', 'valueForMoneyScore', 'hungoverRecoveryScore', 'munchyScore',
    'varietyScore', 'macroFriendlyScore', 'soloDinerScore', 'energySustainScore',
    'workFriendlyScore', 'priceTier', 'cuisineKey',
  ],
} as const;

const batchResponseSchema = {
  type: 'OBJECT',
  properties: {
    overviews: { type: 'ARRAY', items: overviewItemSchema },
  },
  required: ['overviews'],
} as const;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are generating restaurant AI overviews for Platebound, a restaurant discovery app.
You will receive up to 5 restaurants per call with Overture Maps metadata (name, category, address parts,
price tier hint, operating status, and a full "Overture fields" block of map/OSM facts when available).
Return JSON only at the root: an object with a single key "overviews" whose value is an array.
The array must contain exactly one object per restaurant provided, in the same order.
Each object must have "gersId" matching that restaurant's GERS ID and all required score fields.

SCORE RULES:
1) summaryGoodBad: concise balanced pros and cons, max 320 chars. No marketing fluff.
2) speedScore: integer 0-5 (0=slowest, 5=fastest counter-service).
3) healthScore: decimal 0-10 (10=healthiest), one decimal place.
4) workoutRecoveryScore: integer 0-10 (10=best for gym recovery).
5) processedScore: integer 0-10 (10=least processed ingredients).
6) calorieScore: integer 0-5 (5=most calorie-dense typical order).
7) proteinScore: integer 0-5 (5=highest protein typical order).
8) carbScore: integer 0-5 (5=highest carb typical order).
9) dateWorthiness: integer 0-5 (5=excellent date spot).
10) noiseLevelEstimate: integer 0-5 (5=very loud).
11) groupSizeSweetSpot: integer 1-6 (ideal party size).
12) absoluteMacros: estimated calories/protein/carbs/fat for a typical order with AI uncertainty caveat.
13) whoThisPlaceIsFor: single concise string describing the target customer.
14) tasteScore: integer 0-5 (5=best flavor execution for this concept).
15) valueForMoneyScore: integer 0-5 (5=best value, weigh price vs. portion/quality).
16) hungoverRecoveryScore: integer 0-5 (5=best for hangover recovery).
17) munchyScore: integer 0-5 (5=most satisfying late-night craving).
18) varietyScore: integer 0-5 (5=broadest menu variety).
19) macroFriendlyScore: integer 0-5 (5=easiest to track macros/calories).
20) soloDinerScore: integer 0-5 (5=most welcoming for solo dining).
21) energySustainScore: integer 0-5 (5=slow sustained fullness, 0=spike and crash).
22) workFriendlyScore: integer 0-5 (5=best for laptop work — wifi/seating vibe).
23) priceTier: integer 1-4 (1=budget, 2=moderate, 3=pricey, 4=fine dining). Infer from category and any provided price tier hint.
24) cuisineKey: single lowercase string from: italian, mexican, american, japanese, chinese, thai, indian,
    mediterranean, korean, vietnamese, french, greek, middle_eastern, caribbean, african, latin,
    cafe, bar, pizza, burger, sandwich, seafood, steak, sushi, ramen, bbq, vegan, vegetarian,
    dessert, bakery, fast_food, breakfast, brunch, or "general" if unclear.

Some restaurants include an "Overture fields" block (verified facts from Overture/OSM map data: alternate names,
categories, cuisine and diet tags, brand, socials, emails, confidence, sources, raw hours/price, etc.)
and/or a "Status" line (e.g. temporarily/permanently closed).
Treat these as ground truth and factor them into the relevant scores (cuisineKey, varietyScore, macroFriendlyScore,
workFriendlyScore, dateWorthiness, groupSizeSweetSpot, whoThisPlaceIsFor, summaryGoodBad) — do not contradict them,
and do not just repeat them verbatim as if you inferred them yourself. If "Status" indicates the place is closed,
reflect that plainly in summaryGoodBad.

Some restaurants include a "Menu info from website" and/or "Hours info from website" block scraped from their real site,
and/or a "Hours from map data" block (context only, may be outdated).
- If a "Hours info from website" block is present, transcribe it into "weekdayDescriptions": an array of exactly 7 strings, one per day starting with Monday, each formatted like "Monday: 9:00 AM \u2013 5:00 PM" or "Monday: Closed". Only use hours explicitly present in that block — never invent or estimate hours. If the block is missing, ambiguous, or does not clearly cover all 7 days, return an empty array for weekdayDescriptions ("Hours from map data" is supplied separately and does not need to be transcribed).
- If a "Menu info from website" block is present, extract up to 4 real menu items with their listed prices into "topMenuItems" (name, price as shown e.g. "$12.99", and a one-sentence overview). Only use items explicitly present in that block — never invent items or prices. If the block is missing or has no clear items/prices, return an empty array for topMenuItems.

Do not invent menu items or opening hours that are not explicitly present in the provided website text. Base scores on category, name, known attributes, and location context. Keep uncertainty explicit.`;

// ─── Website Scraper (1-Depth) ─────────────────────────────────────────────────

function stripNoisyHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ');
}

function htmlToLines(html: string): string[] {
  const withBreaks = stripNoisyHtml(html)
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|section|article|main|table|tr|td|th|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  return withBreaks
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 2);
}

function scoreHoursLine(line: string): number {
  let score = 0;
  if (DAY_NAME_RE.test(line)) score += 5;
  if (HOURS_SIGNAL_RE.test(line)) score += 4;
  if (/\bhours?\b|\bopen(?:ing)?\b|\bschedule\b|\bclosed\b/i.test(line)) score += 2;
  if (BOILERPLATE_RE.test(line)) score -= 8;
  if (SOCIAL_RE.test(line)) score -= 4;
  if (MENU_SIGNAL_RE.test(line) && !HOURS_SIGNAL_RE.test(line)) score -= 3;
  if (line.length > 180 && !DAY_NAME_RE.test(line)) score -= 2;
  return score;
}

function scoreMenuLine(line: string): number {
  let score = 0;
  if (MENU_SIGNAL_RE.test(line)) score += 5;
  if (MENU_KEYWORD_RE.test(line)) score += 2;
  if (BOILERPLATE_RE.test(line)) score -= 8;
  if (SOCIAL_RE.test(line)) score -= 4;
  if (line.length > 220 && !MENU_SIGNAL_RE.test(line)) score -= 2;
  if (/^(home|about|contact|locations?|hours?|gallery|events?)$/i.test(line)) score -= 3;
  return score;
}

function selectRelevantLines(lines: string[], maxChars: number, scoreLine: (line: string) => number): string {
  const deduped: { line: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 2) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const score = scoreLine(line);
    if (score <= -5) continue;
    deduped.push({ line, score });
  }

  if (deduped.length === 0) return '';

  const appendLines = (items: { line: string }[]) => {
    let text = '';
    for (const item of items) {
      const next = text ? `${text}\n${item.line}` : item.line;
      if (next.length > maxChars) break;
      text = next;
    }
    return text;
  };

  const strong = deduped.filter(item => item.score >= 4);
  if (strong.length > 0) {
    const strongText = appendLines(strong);
    if (strongText.length >= Math.min(maxChars, 400)) return strongText;

    let text = strongText;
    for (const item of deduped) {
      if (item.score >= 4) continue;
      if (item.score < 1) continue;
      const next = text ? `${text}\n${item.line}` : item.line;
      if (next.length > maxChars) break;
      text = next;
    }
    if (text.length > 0) return text;
  }

  return appendLines(deduped.filter(item => item.score >= 0));
}

function extractRelevantMenuText(html: string, maxChars = MAX_RELEVANT_TEXT_CHARS): string {
  if (!html) return '';
  return selectRelevantLines(htmlToLines(html), maxChars, scoreMenuLine);
}

function extractRelevantHoursText(html: string, maxChars = MAX_HOURS_TEXT_CHARS): string {
  if (!html) return '';
  return selectRelevantLines(htmlToLines(html), maxChars, scoreHoursLine);
}

function resolveLinkedUrl(href: string, baseUrl: string): string | null {
  try {
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return null;
    }
    return trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function findLinkedPage(homeHtml: string, baseUrl: string, keywords: string[]): string | null {
  const regex = new RegExp(`href=["']([^"']*(?:${keywords.join('|')})[^"']*)["']`, 'i');
  const match = regex.exec(homeHtml);
  if (!match?.[1]) return null;
  const resolved = resolveLinkedUrl(match[1], baseUrl);
  if (!resolved || resolved === baseUrl || resolved === `${baseUrl}/`) return null;
  return resolved;
}

function dayOfWeekToIndex(value: unknown): number | null {
  const raw = String(value ?? '').toLowerCase().replace(/.*\//, '').trim();
  const map: Record<string, number> = {
    monday: 0, mon: 0,
    tuesday: 1, tue: 1, tues: 1,
    wednesday: 2, wed: 2,
    thursday: 3, thu: 3, thur: 3, thurs: 3,
    friday: 4, fri: 4,
    saturday: 5, sat: 5,
    sunday: 6, sun: 6,
  };
  return map[raw] ?? null;
}

function formatTime12h(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(midnight|12:00\s*am)$/i.test(trimmed)) return '12:00 AM';
  if (/^noon$/i.test(trimmed)) return '12:00 PM';

  let match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return trimmed;

  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3]?.toUpperCase();

  if (ampm) {
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  }

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function formatHoursRange(opens: string, closes: string): string {
  const openText = formatTime12h(opens);
  const closeText = formatTime12h(closes);
  if (openText && closeText) return `${openText} – ${closeText}`;
  if (openText) return `${openText} – Close`;
  return 'Closed';
}

function expandDayOfWeek(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => expandDayOfWeek(item));
  }
  const index = dayOfWeekToIndex(value);
  return index == null ? [] : [index];
}

function collectOpeningHoursSpecs(node: unknown, out: Array<{ days: number[]; opens: string; closes: string }>, rawHours: string[]): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) collectOpeningHoursSpecs(item, out, rawHours);
    return;
  }

  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj['@graph'])) {
    collectOpeningHoursSpecs(obj['@graph'], out, rawHours);
  }

  const specs = obj.openingHoursSpecification;
  if (Array.isArray(specs)) {
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object') continue;
      const record = spec as Record<string, unknown>;
      const days = expandDayOfWeek(record.dayOfWeek);
      const opens = String(record.opens ?? '').trim();
      const closes = String(record.closes ?? '').trim();
      if (days.length === 0) continue;
      out.push({ days, opens, closes });
    }
  }

  const openingHours = obj.openingHours;
  if (typeof openingHours === 'string' && openingHours.trim()) {
    rawHours.push(openingHours.trim());
  } else if (Array.isArray(openingHours)) {
    for (const entry of openingHours) {
      if (typeof entry === 'string' && entry.trim()) rawHours.push(entry.trim());
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectOpeningHoursSpecs(value, out, rawHours);
  }
}

function extractJsonLdHoursBundle(html: string): { weekdayDescriptions: string[]; rawHoursText: string } {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const specs: Array<{ days: number[]; opens: string; closes: string }> = [];
  const rawHours: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      collectOpeningHoursSpecs(JSON.parse(match[1]), specs, rawHours);
    } catch {
      // ignore invalid JSON-LD
    }
  }

  const byDay = new Map<number, string[]>();
  for (const spec of specs) {
    const range = spec.closes
      ? formatHoursRange(spec.opens, spec.closes)
      : spec.opens;
    for (const day of spec.days) {
      if (!byDay.has(day)) byDay.set(day, []);
      const existing = byDay.get(day)!;
      if (!existing.includes(range)) existing.push(range);
    }
  }

  let weekdayDescriptions: string[] = [];
  if (specs.length > 0) {
    weekdayDescriptions = WEEKDAY_NAMES.map((dayName, i) => {
      const ranges = byDay.get(i);
      return ranges && ranges.length > 0
        ? `${dayName}: ${ranges.join(', ')}`
        : `${dayName}: Closed`;
    });
    const hasAnyOpen = weekdayDescriptions.some(line => !/:\s*closed$/i.test(line));
    if (!hasAnyOpen) weekdayDescriptions = [];
  }

  return {
    weekdayDescriptions,
    rawHoursText: rawHours.join('\n'),
  };
}

async function fetchHtmlWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function scrapeWebsite(websiteUrl: string): Promise<ScrapeResult> {
  const empty: ScrapeResult = { menuText: '', hoursText: '', jsonLdWeekdayDescriptions: [] };
  if (!websiteUrl) return empty;

  const homeHtml = await fetchHtmlWithTimeout(websiteUrl);
  if (!homeHtml) return empty;

  const menuUrl = findLinkedPage(homeHtml, websiteUrl, MENU_KEYWORDS);
  const hoursUrl = findLinkedPage(homeHtml, websiteUrl, HOURS_KEYWORDS);

  const fetchTargets = new Set<string>();
  if (menuUrl) fetchTargets.add(menuUrl);
  if (hoursUrl) fetchTargets.add(hoursUrl);

  const extraHtml = new Map<string, string>();
  await Promise.all(
    [...fetchTargets].map(async (url) => {
      extraHtml.set(url, await fetchHtmlWithTimeout(url, 6000));
    })
  );

  const menuHtml = menuUrl ? extraHtml.get(menuUrl) ?? '' : '';
  const hoursHtml = hoursUrl ? extraHtml.get(hoursUrl) ?? '' : '';

  const jsonLdFromAllPages = [homeHtml, menuHtml, hoursHtml].reduce(
    (acc, html) => {
      const bundle = extractJsonLdHoursBundle(html);
      if (acc.weekdayDescriptions.length === 0 && bundle.weekdayDescriptions.length === 7) {
        acc.weekdayDescriptions = bundle.weekdayDescriptions;
      }
      if (bundle.rawHoursText) acc.rawHoursText.push(bundle.rawHoursText);
      return acc;
    },
    { weekdayDescriptions: [] as string[], rawHoursText: [] as string[] }
  );

  const menuTextFromPage = menuHtml ? extractRelevantMenuText(menuHtml) : '';
  const menuTextFromHome = extractRelevantMenuText(homeHtml);
  const menuText = menuTextFromPage.length > 80
    ? menuTextFromPage
    : [menuTextFromPage, menuTextFromHome].filter(Boolean).join('\n').slice(0, MAX_RELEVANT_TEXT_CHARS);

  const hoursChunks = [
    jsonLdFromAllPages.weekdayDescriptions.length === 7
      ? jsonLdFromAllPages.weekdayDescriptions.join('\n')
      : '',
    ...jsonLdFromAllPages.rawHoursText,
    hoursHtml ? extractRelevantHoursText(hoursHtml) : '',
    extractRelevantHoursText(homeHtml),
  ].filter(Boolean);

  const hoursText = [...new Set(hoursChunks)].join('\n').slice(0, MAX_HOURS_TEXT_CHARS);

  return {
    menuText,
    hoursText,
    jsonLdWeekdayDescriptions: jsonLdFromAllPages.weekdayDescriptions,
  };
}

// ─── Place Text Block Builder ─────────────────────────────────────────────────

function buildPlaceBlock(place: InputPlace, scrape?: ScrapeResult): string {
  const addressParts = [
    place.address,
    place.city,
    place.region,
    place.postcode,
    place.country,
  ].filter(Boolean);
  const lines = [
    `GERS ID: ${place.gers_id}`,
    `Name: ${place.name}`,
    `Category: ${place.category || 'restaurant'}`,
    `Address: ${addressParts.join(', ') || 'Unknown'}`,
    `Phone: ${place.phone || 'Not available'}`,
    `Website: ${place.website_url || 'None'}`,
    `Price tier hint: ${place.price_tier ?? 'unknown'}`,
    `Lat/Lng: ${place.location?.latitude?.toFixed(5) ?? ''}, ${place.location?.longitude?.toFixed(5) ?? ''}`,
  ];
  if (place.operating_status && place.operating_status !== 'open') {
    lines.push(`Status: ${place.operating_status.replace(/_/g, ' ')}`);
  }
  if (place.attributes && place.attributes.length > 0) {
    lines.push(`Overture fields (from map data, treat as reliable):\n${place.attributes.join('\n')}`);
  }
  const mapHours = place.regular_opening_hours?.weekdayDescriptions;
  if (mapHours?.length === 7 && !scrape?.hoursText) {
    lines.push(`Hours from map data (for context only, may be outdated):\n${mapHours.join('\n')}`);
  }
  if (scrape?.hoursText) {
    lines.push(`Hours info from website:\n${scrape.hoursText}`);
  }
  if (scrape?.menuText) {
    lines.push(`Menu info from website:\n${scrape.menuText}`);
  }
  return lines.join('\n');
}

function buildBatchPrompt(batch: InputPlace[], scrapeByGersId: Map<string, ScrapeResult>): string {
  const blocks = batch.map((p, i) =>
    `=== Restaurant ${i + 1} ===\n${buildPlaceBlock(p, scrapeByGersId.get(p.gers_id))}`
  ).join('\n\n');

  return `You are given exactly ${batch.length} restaurant(s). Return one JSON object with key "overviews" containing an array of exactly ${batch.length} objects (same order). Each must include "gersId" matching the restaurant's GERS ID and all required score fields.

${blocks}`;
}

// ─── Sanitizer ────────────────────────────────────────────────────────────────

function sanitizeWeekdayDescriptions(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length !== 7) return [];
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const text = String(raw[i] ?? '').trim();
    if (!text) return [];
    const prefix = `${WEEKDAY_NAMES[i]}:`;
    if (text.toLowerCase().startsWith(WEEKDAY_NAMES[i].toLowerCase())) {
      lines.push(text.slice(0, 120));
    } else {
      lines.push(`${prefix} ${text.replace(/^[^:]+:\s*/, '').slice(0, 100)}`);
    }
  }
  return lines;
}

function sanitizeTopMenuItems(raw: unknown): Array<{ name: string; price: string; overview: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; price: string; overview: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = String((item as any).name ?? '').trim().slice(0, 80);
    const price = String((item as any).price ?? '').trim().slice(0, 20);
    const overview = String((item as any).overview ?? '').trim().slice(0, 160);
    if (!name) continue;
    out.push({ name, price, overview });
    if (out.length >= 4) break;
  }
  return out;
}

function sanitizeOverview(
  raw: any,
  priceTierHint?: number | null,
  scrapedWeekdayDescriptions?: string[],
): AiOverview | null {
  if (!raw || typeof raw !== 'object') return null;

  const toInt = (v: any, fallback = 0) => {
    const n = Number.parseInt(String(v), 10);
    return Number.isNaN(n) ? fallback : n;
  };
  const toFloat = (v: any) => {
    const n = Number.parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
  };
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const summaryGoodBad = String(raw.summaryGoodBad ?? '').trim().slice(0, 400);
  const absoluteMacros = String(raw.absoluteMacros ?? '').trim();
  const whoThisPlaceIsFor = String(raw.whoThisPlaceIsFor ?? '').trim();
  if (!summaryGoodBad || !absoluteMacros || !whoThisPlaceIsFor) return null;

  const priceTier = clamp(
    toInt(raw.priceTier, typeof priceTierHint === 'number' ? priceTierHint : 2),
    1,
    4,
  );

  // Validate cuisine key
  const validCuisineKeys = new Set([
    'italian', 'mexican', 'american', 'japanese', 'chinese', 'thai', 'indian',
    'mediterranean', 'korean', 'vietnamese', 'french', 'greek', 'middle_eastern',
    'caribbean', 'african', 'latin', 'cafe', 'bar', 'pizza', 'burger', 'sandwich',
    'seafood', 'steak', 'sushi', 'ramen', 'bbq', 'vegan', 'vegetarian',
    'dessert', 'bakery', 'fast_food', 'breakfast', 'brunch', 'general',
  ]);
  const cuisineKeyRaw = String(raw.cuisineKey ?? 'general').toLowerCase().trim();
  const cuisineKey = validCuisineKeys.has(cuisineKeyRaw) ? cuisineKeyRaw : 'general';

  return {
    summaryGoodBad,
    speedScore: clamp(toInt(raw.speedScore), 0, 5),
    healthScore: Number(clamp(toFloat(raw.healthScore), 0, 10).toFixed(1)),
    workoutRecoveryScore: clamp(toInt(raw.workoutRecoveryScore), 0, 10),
    processedScore: clamp(toInt(raw.processedScore), 0, 10),
    calorieScore: clamp(toInt(raw.calorieScore), 0, 5),
    proteinScore: clamp(toInt(raw.proteinScore), 0, 5),
    carbScore: clamp(toInt(raw.carbScore), 0, 5),
    dateWorthiness: clamp(toInt(raw.dateWorthiness), 0, 5),
    noiseLevelEstimate: clamp(toInt(raw.noiseLevelEstimate), 0, 5),
    groupSizeSweetSpot: clamp(toInt(raw.groupSizeSweetSpot, 2), 1, 6),
    absoluteMacros,
    whoThisPlaceIsFor,
    tasteScore: clamp(toInt(raw.tasteScore), 0, 5),
    valueForMoneyScore: clamp(toInt(raw.valueForMoneyScore), 0, 5),
    hungoverRecoveryScore: clamp(toInt(raw.hungoverRecoveryScore), 0, 5),
    munchyScore: clamp(toInt(raw.munchyScore), 0, 5),
    varietyScore: clamp(toInt(raw.varietyScore), 0, 5),
    macroFriendlyScore: clamp(toInt(raw.macroFriendlyScore), 0, 5),
    soloDinerScore: clamp(toInt(raw.soloDinerScore), 0, 5),
    energySustainScore: clamp(toInt(raw.energySustainScore), 0, 5),
    workFriendlyScore: clamp(toInt(raw.workFriendlyScore), 0, 5),
    topMenuItems: sanitizeTopMenuItems(raw.topMenuItems),
    priceTier,
    cuisineKey,
    // Prefer deterministic JSON-LD hours scraped directly from the site over
    // the model's transcription of freeform hours text.
    weekdayDescriptions: scrapedWeekdayDescriptions?.length === 7
      ? scrapedWeekdayDescriptions
      : sanitizeWeekdayDescriptions(raw.weekdayDescriptions),
  };
}

async function runGeminiBatch(
  batch: InputPlace[],
  geminiUrl: string
): Promise<{ gersId: string; overview: AiOverview }[]> {
  const batchIds = new Set(batch.map(p => p.gers_id));
  const out: { gersId: string; overview: AiOverview }[] = [];

  // Free enrichment: scrape each restaurant's own website (JSON-LD hours +
  // menu page text) before asking Gemini. This is the source of real hours
  // and menu prices — Overture alone rarely has them.
  const scrapeByGersId = new Map<string, ScrapeResult>();
  await Promise.all(
    batch.map(async (p) => {
      if (!p.website_url) return;
      try {
        const result = await scrapeWebsite(p.website_url);
        scrapeByGersId.set(p.gers_id, result);
      } catch {
        // best-effort — leave unscraped on failure
      }
    })
  );

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildBatchPrompt(batch, scrapeByGersId) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: batchResponseSchema,
      },
    }),
  });

  if (!response.ok) {
    console.error(`[v2-generate-ai-overview] Gemini API error: ${response.status}`);
    return out;
  }

  const modelData = await response.json();
  const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('[v2-generate-ai-overview] Gemini returned empty response');
    return out;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error('[v2-generate-ai-overview] Failed to parse Gemini JSON');
    return out;
  }

  const items = parsed?.overviews;
  if (!Array.isArray(items)) return out;

  for (const item of items) {
    const gersId = String(item?.gersId ?? '').trim();
    if (!gersId || !batchIds.has(gersId)) continue;

    const place = batch.find(p => p.gers_id === gersId);
    const scraped = scrapeByGersId.get(gersId);
    // Prefer deterministic hours: scraped website JSON-LD first, then the
    // already-parsed OSM/Overture hours on the place, then the model's guess.
    const deterministicHours = scraped?.jsonLdWeekdayDescriptions?.length === 7
      ? scraped.jsonLdWeekdayDescriptions
      : place?.regular_opening_hours?.weekdayDescriptions;
    const overview = sanitizeOverview(item, place?.price_tier ?? null, deterministicHours);
    if (!overview) continue;

    out.push({ gersId, overview });
  }

  return out;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { places } = await req.json();
    if (!places || !Array.isArray(places)) {
      return new Response(JSON.stringify({ error: 'places array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY missing');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const validPlaces = (places as InputPlace[]).filter(p => p?.gers_id);

    // ── Step 1: Check which GERS IDs are already cached ───────────────────────
    const gersIds = validPlaces.map(p => p.gers_id);
    const { data: cachedRows, error: cacheReadError } = await supabase
      .from('v2_ai_overview_cache')
      .select('gers_id')
      .in('gers_id', gersIds);

    if (cacheReadError) {
      console.warn(`[v2-generate-ai-overview] Supabase cache read error: ${cacheReadError.message}`);
    }

    const cachedIds = new Set((cachedRows ?? []).map((r: { gers_id: string }) => r.gers_id));
    console.log(`[v2-generate-ai-overview] Supabase v2 AI cache: ${cachedIds.size} / ${gersIds.length} already cached`);

    const uncachedPlaces = validPlaces.filter(p => !cachedIds.has(p.gers_id));
    if (uncachedPlaces.length === 0) {
      console.log('[v2-generate-ai-overview] All places already cached, nothing to generate');
      return new Response(JSON.stringify({ generatedOverviews: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const batches: InputPlace[][] = [];
    for (let i = 0; i < uncachedPlaces.length; i += BATCH_SIZE) {
      batches.push(uncachedPlaces.slice(i, i + BATCH_SIZE));
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    console.log(`[v2-generate-ai-overview] Running ${batches.length} Gemini batch(es) of up to ${BATCH_SIZE}...`);
    const perBatch = await Promise.all(
      batches.map(b => runGeminiBatch(b, geminiUrl))
    );
    const generatedOverviews = perBatch.flat();
    console.log(`[v2-generate-ai-overview] Gemini generated ${generatedOverviews.length} overviews`);

    // ── Step 4: Upsert to v2_ai_overview_cache ────────────────────────────────
    const updatedAt = new Date().toISOString();
    const placeMap = new Map(uncachedPlaces.map(p => [p.gers_id, p]));

    if (generatedOverviews.length > 0) {
      await Promise.all(
        generatedOverviews.map(({ gersId, overview }) => {
          const place = placeMap.get(gersId);
          return supabase.from('v2_ai_overview_cache').upsert({
            gers_id: gersId,
            summary_good_bad: overview.summaryGoodBad,
            speed_score: overview.speedScore,
            health_score: overview.healthScore,
            workout_recovery_score: overview.workoutRecoveryScore,
            processed_score: overview.processedScore,
            calorie_score: overview.calorieScore,
            protein_score: overview.proteinScore,
            carb_score: overview.carbScore,
            date_worthiness: overview.dateWorthiness,
            noise_level_estimate: overview.noiseLevelEstimate,
            group_size_sweet_spot: overview.groupSizeSweetSpot,
            absolute_macros: overview.absoluteMacros,
            who_this_place_is_for: overview.whoThisPlaceIsFor,
            taste_score: overview.tasteScore,
            value_for_money_score: overview.valueForMoneyScore,
            hungover_recovery_score: overview.hungoverRecoveryScore,
            munchy_score: overview.munchyScore,
            variety_score: overview.varietyScore,
            macro_friendly_score: overview.macroFriendlyScore,
            solo_diner_score: overview.soloDinerScore,
            energy_sustain_score: overview.energySustainScore,
            work_friendly_score: overview.workFriendlyScore,
            top_menu_items: overview.topMenuItems,
            price_tier: overview.priceTier,
            cuisine_key: overview.cuisineKey,
            weekday_descriptions: overview.weekdayDescriptions.length > 0 ? overview.weekdayDescriptions : null,
            website_url: place?.website_url ?? null,
            updated_at: updatedAt,
          }, { onConflict: 'gers_id' });
        })
      );
      console.log(`[v2-generate-ai-overview] Supabase upsert complete: ${generatedOverviews.length} rows written to v2_ai_overview_cache`);
    }

    return new Response(JSON.stringify({ generatedOverviews }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[v2-generate-ai-overview] Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
