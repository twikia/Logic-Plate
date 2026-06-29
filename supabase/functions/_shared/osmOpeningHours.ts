const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const DAY_INDEX: Record<string, number> = {
  Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6,
};

function expandDayRange(start: string, end: string): number[] {
  const a = DAY_INDEX[start];
  const b = DAY_INDEX[end];
  if (a == null || b == null) return [];
  const out: number[] = [];
  if (a <= b) {
    for (let i = a; i <= b; i++) out.push(i);
  } else {
    for (let i = a; i < 7; i++) out.push(i);
    for (let i = 0; i <= b; i++) out.push(i);
  }
  return out;
}

function expandDaySpec(spec: string): number[] {
  const trimmed = spec.trim();
  if (!trimmed) return [];
  if (DAY_INDEX[trimmed] != null) return [DAY_INDEX[trimmed]];
  const rangeMatch = trimmed.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
  if (rangeMatch) return expandDayRange(rangeMatch[1], rangeMatch[2]);
  const list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  const out: number[] = [];
  for (const part of list) {
    if (DAY_INDEX[part] != null) out.push(DAY_INDEX[part]);
    else {
      const rm = part.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
      if (rm) out.push(...expandDayRange(rm[1], rm[2]));
    }
  }
  return [...new Set(out)];
}

function formatTime24h(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return raw.trim();
  let hours = Number.parseInt(m[1], 10);
  const mins = m[2];
  if (!Number.isFinite(hours)) return raw.trim();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${mins} ${suffix}`;
}

function formatHoursRange(opens: string, closes: string): string {
  return `${formatTime24h(opens)} – ${formatTime24h(closes)}`;
}

export function parseOsmPriceRange(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && raw >= 1 && raw <= 4) return raw;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  if (/^\$+$/.test(text)) return Math.min(4, text.length);
  const numeric = Number.parseInt(text, 10);
  if (numeric >= 1 && numeric <= 4) return numeric;
  if (text.includes('inexpensive') || text.includes('budget')) return 1;
  if (text.includes('moderate')) return 2;
  if (text.includes('very_expensive') || text.includes('fine')) return 4;
  if (text.includes('expensive') || text.includes('pricey')) return 3;
  return null;
}

export function parseOsmOpeningHours(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const text = raw.trim();
  if (/^24\s*\/\s*7$/i.test(text)) {
    return WEEKDAY_NAMES.map(day => `${day}: Open 24 hours`);
  }

  const byDay = new Map<number, string[]>();
  const segments = text.split(';').map(s => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^([A-Za-z0-9,\-]+)\s+(.+)$/);
    if (!match) continue;
    const days = expandDaySpec(match[1]);
    const timePart = match[2].trim();
    if (days.length === 0) continue;

    if (/^off$/i.test(timePart)) {
      for (const day of days) byDay.set(day, ['Closed']);
      continue;
    }

    const ranges = timePart.split(',').map(s => s.trim()).filter(Boolean);
    const formattedRanges: string[] = [];
    for (const range of ranges) {
      const rm = range.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (rm) formattedRanges.push(formatHoursRange(rm[1], rm[2]));
    }
    if (formattedRanges.length === 0) continue;
    const line = formattedRanges.join(', ');
    for (const day of days) byDay.set(day, [line]);
  }

  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const hours = byDay.get(i);
    lines.push(`${WEEKDAY_NAMES[i]}: ${hours?.length ? hours.join(', ') : 'Closed'}`);
  }
  return lines;
}

export function extractOsmField(props: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const direct = props[key];
    if (direct != null && direct !== '') return direct;
  }
  const tags = props.tags;
  if (tags && typeof tags === 'object') {
    const tagObj = tags as Record<string, unknown>;
    for (const key of keys) {
      const val = tagObj[key];
      if (val != null && val !== '') return val;
    }
  }
  return null;
}
