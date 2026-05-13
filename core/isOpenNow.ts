type Period = { open: number; close: number };

function parseTime(t: string): number | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function parsePeriods(line: string): Period[] | 'open24' | 'closed' {
  const afterColon = line.split(/:\s(.+)/)[1] ?? '';
  if (!afterColon) return 'closed';
  if (/open 24 hours/i.test(afterColon)) return 'open24';
  if (/closed/i.test(afterColon)) return 'closed';

  const periods: Period[] = [];
  const segments = afterColon.split(/,\s*/);
  for (const seg of segments) {
    const rm = seg.match(/(\d+:\d+\s*[AP]M)\s*[–\-]\s*(\d+:\d+\s*[AP]M)/i);
    if (!rm) continue;
    const open = parseTime(rm[1]);
    const close = parseTime(rm[2]);
    if (open == null || close == null) continue;
    periods.push({ open, close });
  }
  return periods.length ? periods : 'closed';
}

function isOpenFromWeekdayDescriptions(
  descriptions: string[],
  googleDay: number,
  nowMins: number
): boolean {
  const todayLine = descriptions[googleDay];
  if (!todayLine) return false;

  const result = parsePeriods(todayLine);
  if (result === 'open24') return true;
  if (result === 'closed') return false;

  return result.some(({ open, close }) => {
    if (close > open) {
      return nowMins >= open && nowMins < close;
    }
    return nowMins >= open || nowMins < close;
  });
}

function weekdayDescriptionSets(place: any): string[][] {
  const hasCurrent =
    (place.currentOpeningHours?.weekdayDescriptions?.length ?? 0) > 0 ||
    (place.currentSecondaryOpeningHours?.weekdayDescriptions?.length ?? 0) > 0;

  if (hasCurrent) {
    return [place.currentOpeningHours?.weekdayDescriptions, place.currentSecondaryOpeningHours?.weekdayDescriptions].filter(
      (x): x is string[] => Array.isArray(x) && x.length > 0
    );
  }

  return [place.regularOpeningHours?.weekdayDescriptions, place.regularSecondaryOpeningHours?.weekdayDescriptions].filter(
    (x): x is string[] => Array.isArray(x) && x.length > 0
  );
}

export function isOpenNow(place: any): boolean {
  const sets = weekdayDescriptionSets(place);
  if (sets.length === 0) return false;

  const now = new Date();
  const googleDay = (now.getDay() + 6) % 7;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const descriptions of sets) {
    if (isOpenFromWeekdayDescriptions(descriptions, googleDay, nowMins)) return true;
  }
  return false;
}

export function isPlaceLikelyOpenNow(place: any): boolean {
  const cur = place?.currentOpeningHours;
  if (cur && typeof cur.openNow === 'boolean') {
    return cur.openNow === true;
  }
  return isOpenNow(place);
}
