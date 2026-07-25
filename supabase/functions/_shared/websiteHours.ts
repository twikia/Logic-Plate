const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const HOURS_KEYWORDS = ['hours', 'hour', 'opening', 'open-hours', 'schedule', 'contact', 'visit-us', 'location'];
const FETCH_USER_AGENT = 'Platebound/2.0 (website-hours; contact: support@platebound.app)';
const DEAD_WEBSITE_STATUSES = new Set([404, 410]);

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

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
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
    return value.flatMap((item) => expandDayOfWeek(item));
  }
  const index = dayOfWeekToIndex(value);
  return index == null ? [] : [index];
}

function collectOpeningHoursSpecs(
  node: unknown,
  out: Array<{ days: number[]; opens: string; closes: string }>,
  rawHours: string[],
): void {
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

export function extractJsonLdHoursBundle(html: string): {
  weekdayDescriptions: string[];
  rawHoursText: string;
} {
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
    const hasAnyOpen = weekdayDescriptions.some((line) => !/:\s*closed$/i.test(line));
    if (!hasAnyOpen) weekdayDescriptions = [];
  }

  return {
    weekdayDescriptions,
    rawHoursText: rawHours.join('\n'),
  };
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

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; status: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return { html: '', status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    clearTimeout(timer);
    return { html: '', status: null };
  }
}

/** Light scrape: homepage (+ linked hours page) JSON-LD only. */
export async function scrapeWebsiteHours(
  websiteUrl: string,
  timeoutMs = 4000,
): Promise<{ weekdayDescriptions: string[]; deadWebsite: boolean }> {
  if (!websiteUrl) {
    return { weekdayDescriptions: [], deadWebsite: false };
  }

  const home = await fetchHtml(websiteUrl, timeoutMs);
  if (home.status != null && DEAD_WEBSITE_STATUSES.has(home.status)) {
    return { weekdayDescriptions: [], deadWebsite: true };
  }
  if (!home.html) {
    return { weekdayDescriptions: [], deadWebsite: false };
  }

  let bundle = extractJsonLdHoursBundle(home.html);
  if (bundle.weekdayDescriptions.length === 7) {
    return { weekdayDescriptions: bundle.weekdayDescriptions, deadWebsite: false };
  }

  const hoursUrl = findLinkedPage(home.html, websiteUrl, HOURS_KEYWORDS);
  if (hoursUrl) {
    const hoursPage = await fetchHtml(hoursUrl, Math.min(timeoutMs, 3500));
    if (hoursPage.html) {
      bundle = extractJsonLdHoursBundle(hoursPage.html);
      if (bundle.weekdayDescriptions.length === 7) {
        return { weekdayDescriptions: bundle.weekdayDescriptions, deadWebsite: false };
      }
    }
  }

  return { weekdayDescriptions: [], deadWebsite: false };
}
