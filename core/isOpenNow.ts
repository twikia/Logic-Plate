type Period = { open: number; close: number };

type GooglePeriodPoint = { day?: number; hour?: number; minute?: number };
type GooglePeriod = { open?: GooglePeriodPoint; close?: GooglePeriodPoint };

export type PlaceLocalTime = { googleWeekday: number; nowMins: number; sunDay: number };

/** Google utcOffsetMinutes: add to UTC to get place-local civil time (e.g. US Eastern = -300). */
function placeUtcOffsetMinutes(place: any): number {
  if (typeof place?.utcOffsetMinutes === 'number' && Number.isFinite(place.utcOffsetMinutes)) {
    return place.utcOffsetMinutes;
  }
  return -new Date().getTimezoneOffset();
}

/** Monday=0 … Sunday=6 (weekdayDescriptions index). sunDay: 0=Sunday (Google periods). */
export function getPlaceLocalTime(place: any): PlaceLocalTime {
  const offsetMin = placeUtcOffsetMinutes(place);
  const local = new Date(Date.now() + offsetMin * 60_000);
  const sunDay = local.getUTCDay();
  const googleWeekday = (sunDay + 6) % 7;
  const nowMins = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { googleWeekday, nowMins, sunDay };
}

function parseTime(t: string): number | null {
  const trimmed = t.trim();
  let m = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    let hours = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }
  m = trimmed.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (m) {
    let hours = parseInt(m[1], 10);
    const ampm = m[2].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60;
  }
  m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hours = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) return hours * 60 + mins;
  }
  return null;
}

function parsePeriods(line: string): Period[] | 'open24' | 'closed' {
  const afterColon = line.split(/:\s(.+)/)[1] ?? '';
  if (!afterColon) return 'closed';
  if (/open 24 hours/i.test(afterColon)) return 'open24';
  if (/^\s*closed\s*$/i.test(afterColon)) return 'closed';

  const periods: Period[] = [];
  const segments = afterColon.split(/,\s*/);
  for (const seg of segments) {
    const rm = seg.match(
      /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*[\u2013\u2014\-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i
    );
    if (!rm) continue;
    const open = parseTime(rm[1]);
    const close = parseTime(rm[2]);
    if (open == null || close == null) continue;
    periods.push({ open, close });
  }
  return periods.length ? periods : 'closed';
}

function isOpenForMins(periods: Period[], nowMins: number): boolean {
  return periods.some(({ open, close }) => {
    if (close > open) {
      return nowMins >= open && nowMins < close;
    }
    return nowMins >= open || nowMins < close;
  });
}

function isOpenFromWeekdayDescriptions(
  descriptions: string[],
  googleWeekday: number,
  nowMins: number
): boolean {
  const todayLine = descriptions[googleWeekday];
  if (!todayLine) return false;

  const result = parsePeriods(todayLine);
  if (result === 'open24') return true;
  if (result === 'closed') return false;
  return isOpenForMins(result, nowMins);
}

function periodPointToMins(p: GooglePeriodPoint | undefined): number | null {
  if (!p || typeof p.hour !== 'number' || typeof p.minute !== 'number') return null;
  if (p.hour < 0 || p.hour > 23 || p.minute < 0 || p.minute > 59) return null;
  return p.hour * 60 + p.minute;
}

function isOpenFromGooglePeriods(periods: GooglePeriod[], sunDay: number, nowMins: number): boolean {
  for (const period of periods) {
    const open = period.open;
    const close = period.close;
    if (!open || typeof open.day !== 'number') continue;
    const openMins = periodPointToMins(open);
    const closeMins = periodPointToMins(close);
    if (openMins == null) continue;

    const openDay = open.day;
    const closeDay = typeof close?.day === 'number' ? close.day : openDay;

    if (closeMins == null) {
      if (openDay === sunDay && nowMins >= openMins) return true;
      continue;
    }

    if (openDay === closeDay) {
      if (openDay !== sunDay) continue;
      if (closeMins > openMins) {
        if (nowMins >= openMins && nowMins < closeMins) return true;
      } else if (nowMins >= openMins || nowMins < closeMins) return true;
      continue;
    }

    const daysBetween = (closeDay - openDay + 7) % 7;
    if (daysBetween === 0) continue;

    if (sunDay === openDay && nowMins >= openMins) return true;
    if (daysBetween > 1) {
      let d = (openDay + 1) % 7;
      while (d !== closeDay) {
        if (sunDay === d) return true;
        d = (d + 1) % 7;
      }
    }
    if (sunDay === closeDay && nowMins < closeMins) return true;
  }
  return false;
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

function googlePeriodSets(place: any): GooglePeriod[][] {
  const hasCurrent =
    (place.currentOpeningHours?.periods?.length ?? 0) > 0 ||
    (place.currentSecondaryOpeningHours?.periods?.length ?? 0) > 0;

  if (hasCurrent) {
    return [place.currentOpeningHours?.periods, place.currentSecondaryOpeningHours?.periods].filter(
      (x): x is GooglePeriod[] => Array.isArray(x) && x.length > 0
    );
  }

  return [place.regularOpeningHours?.periods, place.regularSecondaryOpeningHours?.periods].filter(
    (x): x is GooglePeriod[] => Array.isArray(x) && x.length > 0
  );
}

function openNowFromHoursFields(place: any): boolean | null {
  const cur = place?.currentOpeningHours;
  if (cur && typeof cur.openNow === 'boolean') return cur.openNow;
  const sec = place?.currentSecondaryOpeningHours;
  if (sec && typeof sec.openNow === 'boolean') return sec.openNow;
  return null;
}

function hasOpeningHoursData(place: any): boolean {
  return googlePeriodSets(place).length > 0 || weekdayDescriptionSets(place).length > 0;
}

function isExplicitlyClosed(place: any): boolean {
  const businessStatus = String(place?.businessStatus || '').toUpperCase();
  if (businessStatus === 'CLOSED_PERMANENTLY' || businessStatus === 'CLOSED_TEMPORARILY') {
    return true;
  }
  const operatingStatus = String(place?.operating_status || '').toLowerCase();
  return operatingStatus === 'permanently_closed' || operatingStatus === 'temporarily_closed';
}

function isOpenFromParsedHours(place: any): boolean {
  const { googleWeekday, nowMins, sunDay } = getPlaceLocalTime(place);

  for (const periods of googlePeriodSets(place)) {
    if (isOpenFromGooglePeriods(periods, sunDay, nowMins)) return true;
  }

  for (const descriptions of weekdayDescriptionSets(place)) {
    if (isOpenFromWeekdayDescriptions(descriptions, googleWeekday, nowMins)) return true;
  }
  return false;
}

export function isOpenNow(place: any): boolean {
  if (isExplicitlyClosed(place)) return false;
  if (hasOpeningHoursData(place)) return isOpenFromParsedHours(place);
  const flagged = openNowFromHoursFields(place);
  if (flagged !== null) return flagged;
  return true;
}

export function isPlaceLikelyOpenNow(place: any): boolean {
  return isOpenNow(place);
}
