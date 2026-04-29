/**
 * isOpenNow.ts
 *
 * Derives real-time open/closed status from a Google Places weekdayDescriptions
 * string array (e.g. "Monday: 11:00 AM – 10:00 PM").
 *
 * Why: The `openNow` field returned by the Places API is cached server-side and
 * can be hours stale — especially around midnight. This function re-evaluates
 * the actual hour ranges against the device's current local time.
 */

type Period = { open: number; close: number }; // minutes since midnight

/** Parse "11:00 AM" → minutes since midnight */
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

/**
 * Parse a single weekday description line, e.g.:
 *   "Monday: 11:00 AM – 10:00 PM"
 *   "Monday: Open 24 hours"
 *   "Monday: Closed"
 *   "Monday: 9:00 AM – 12:00 AM"  (closes past midnight)
 */
function parsePeriods(line: string): Period[] | 'open24' | 'closed' {
  const afterColon = line.split(/:\s(.+)/)[1] ?? '';
  if (!afterColon) return 'closed';
  if (/open 24 hours/i.test(afterColon)) return 'open24';
  if (/closed/i.test(afterColon)) return 'closed';

  const periods: Period[] = [];
  // There can be multiple ranges separated by ", " — e.g. lunch + dinner
  const segments = afterColon.split(/,\s*/);
  for (const seg of segments) {
    // Match "H:MM AM/PM – H:MM AM/PM"
    const rm = seg.match(/(\d+:\d+\s*[AP]M)\s*[–\-]\s*(\d+:\d+\s*[AP]M)/i);
    if (!rm) continue;
    const open  = parseTime(rm[1]);
    const close = parseTime(rm[2]);
    if (open == null || close == null) continue;
    periods.push({ open, close });
  }
  return periods.length ? periods : 'closed';
}

/**
 * Returns true if the place is open right now based on weekdayDescriptions.
 * Falls back to the API `openNow` flag if no parseable descriptions are found.
 */
export function isOpenNow(place: any): boolean {
  const descriptions: string[] | undefined =
    place.currentOpeningHours?.weekdayDescriptions ??
    place.regularOpeningHours?.weekdayDescriptions;

  // Fallback: use API flag if we have no descriptions to parse
  if (!descriptions?.length) {
    return (
      place.currentOpeningHours?.openNow === true ||
      place.regularOpeningHours?.openNow === true
    );
  }

  const now   = new Date();
  // getDay() returns 0=Sun, Google weekdayDescriptions are 0=Mon … 6=Sun
  const googleDay = (now.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const nowMins   = now.getHours() * 60 + now.getMinutes();

  const todayLine = descriptions[googleDay];
  if (!todayLine) return false;

  const result = parsePeriods(todayLine);
  if (result === 'open24') return true;
  if (result === 'closed')  return false;

  return result.some(({ open, close }) => {
    if (close > open) {
      // Normal period: e.g. 11:00 AM – 10:00 PM
      return nowMins >= open && nowMins < close;
    } else {
      // Crosses midnight: e.g. 9:00 PM – 2:00 AM
      return nowMins >= open || nowMins < close;
    }
  });
}
