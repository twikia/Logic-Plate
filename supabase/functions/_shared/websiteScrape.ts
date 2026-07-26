/** Shared website ping + HTML scrape for AI overview and bulk scrape edges. */

export type ScrapeResult = {
  menuText: string;
  hoursText: string;
  jsonLdWeekdayDescriptions: string[];
  deadWebsite: boolean;
};

export type PingResult = "alive" | "dead" | "unknown";

const FETCH_USER_AGENT = "Platebound/2.0 (website-scrape; contact: support@platebound.app)";
const PING_TIMEOUT_MS = 1500;
const PING_UA = "Platebound/2.0 (website-liveness; contact: support@platebound.app)";
export const DEAD_PING_STATUSES = new Set([404, 410, 521, 522, 523, 525, 526, 530]);
const MENU_KEYWORDS = ["menu", "food", "drink", "dining", "eat"];
const HOURS_KEYWORDS = ["hours", "hour", "opening", "open-hours", "schedule", "contact", "visit-us", "location"];
const MAX_RELEVANT_TEXT_CHARS = 800;
const MAX_HOURS_TEXT_CHARS = 600;
const FETCH_TIMEOUT_MS = 7000;
const WEEKDAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const MENU_SIGNAL_RE = /\$\d{1,3}(?:\.\d{2})?|\b\d{1,2}\.\d{2}\b|\b\d{1,3}\s*(?:USD|usd)\b/i;
const MENU_KEYWORD_RE = /\b(menu|appetizer|entree|entrée|dessert|salad|soup|sandwich|burger|pizza|pasta|steak|chicken|fish|seafood|taco|bowl|wrap|brunch|lunch|dinner|special|vegan|vegetarian|gluten|cocktail|wine|beer|beverage|side|platter|combo|sushi|ramen|bbq|grill|bistro|cafe|bakery)\b/i;
const HOURS_SIGNAL_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|midnight|noon|\b24\s*hours?\b|open\s+daily)\b/i;
const TIME_RANGE_RE = /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/i;
const DAILY_HOURS_RE = /\b(daily|every\s+day|7\s*days(?:\s*a\s*week)?|open\s+daily)\b/i;
const DAY_NAME_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const BOILERPLATE_RE = /\b(cookie|privacy policy|terms of (use|service)|subscribe|newsletter|follow us|all rights reserved|powered by|accessibility|sitemap|careers|press kit|opt.?out|gdpr|consent|manage preferences|sign up for|join our mailing)\b|©/i;
const SOCIAL_RE = /\b(instagram|facebook|twitter|tiktok|youtube|linkedin)\b/i;

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

/** Only pass hours prose to Gemini when it looks like a real schedule, not random AM/PM noise. */
export function hoursTextLooksParseable(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const hasTime = HOURS_SIGNAL_RE.test(t) || TIME_RANGE_RE.test(t);
  if (!hasTime) return false;
  if (DAY_NAME_RE.test(t)) return true;
  if (DAILY_HOURS_RE.test(t) && (TIME_RANGE_RE.test(t) || HOURS_SIGNAL_RE.test(t))) return true;
  if (/\bopen\b/i.test(t) && TIME_RANGE_RE.test(t)) return true;
  const ampmHits = t.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b/g)?.length ?? 0;
  return ampmHits >= 2 && (DAILY_HOURS_RE.test(t) || /\bclosed\b/i.test(t));
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

// ─── Ping + Concurrency Helpers ───────────────────────────────────────────────

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

export function isDeadTransportError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('dns') ||
    m.includes('getaddrinfo') ||
    m.includes('name or service not known') ||
    m.includes('no such host') ||
    m.includes('nxdomain') ||
    m.includes('enotfound') ||
    m.includes('failed to lookup') ||
    m.includes('nodename nor servname') ||
    m.includes('econnrefused') ||
    m.includes('connection refused') ||
    m.includes('econnreset') ||
    m.includes('connection reset') ||
    m.includes('forcibly closed') ||
    m.includes('remote end closed') ||
    m.includes('ssl') ||
    m.includes('tls') ||
    m.includes('certificate') ||
    m.includes('cert_') ||
    m.includes('err_cert') ||
    m.includes('wrong version number') ||
    m.includes('hostname mismatch') ||
    m.includes('handshake')
  );
}

export async function pingWebsite(url: string): Promise<PingResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const headers = { 'User-Agent': PING_UA, Accept: '*/*' };
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    }
    clearTimeout(timer);
    if (DEAD_PING_STATUSES.has(res.status)) return 'dead';
    return 'alive';
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') return 'unknown';
    if (err instanceof Error && err.name === 'AbortError') return 'unknown';
    const msg = String(err instanceof Error ? err.message : err);
    if (isDeadTransportError(msg)) return 'dead';
    if (err instanceof TypeError) return 'dead';
    return 'unknown';
  }
}

// ─── Website Scraper ──────────────────────────────────────────────────────────

type FetchHtmlResult = { html: string; status: number | null; deadTransport?: boolean };

async function fetchHtmlWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { html: '', status: res.status };
    return { html: await res.text(), status: res.status };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { html: '', status: null };
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { html: '', status: null };
    }
    const msg = String(err instanceof Error ? err.message : err);
    if (isDeadTransportError(msg) || err instanceof TypeError) {
      return { html: '', status: null, deadTransport: true };
    }
    return { html: '', status: null };
  }
}

export async function scrapeWebsite(websiteUrl: string): Promise<ScrapeResult> {
  const empty: ScrapeResult = {
    menuText: '',
    hoursText: '',
    jsonLdWeekdayDescriptions: [],
    deadWebsite: false,
  };
  if (!websiteUrl) return empty;

  const home = await fetchHtmlWithTimeout(websiteUrl);
  if (home.deadTransport || (home.status != null && DEAD_PING_STATUSES.has(home.status))) {
    return { ...empty, deadWebsite: true };
  }
  const homeHtml = home.html;
  if (!homeHtml) return empty;

  const menuUrl = findLinkedPage(homeHtml, websiteUrl, MENU_KEYWORDS);
  const hoursUrl = findLinkedPage(homeHtml, websiteUrl, HOURS_KEYWORDS);

  const fetchTargets = new Set<string>();
  if (menuUrl) fetchTargets.add(menuUrl);
  if (hoursUrl) fetchTargets.add(hoursUrl);

  const extraHtml = new Map<string, string>();
  await Promise.all(
    [...fetchTargets].map(async (url) => {
      const result = await fetchHtmlWithTimeout(url, 6000);
      extraHtml.set(url, result.html);
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
    deadWebsite: false,
  };
}

