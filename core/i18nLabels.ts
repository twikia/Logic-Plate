import i18n from '@/i18n';
import type { RandomSortBy } from './randomPickerState';
import type { ScenarioKey } from './scenarioFilters';

export function tSortLabel(key: RandomSortBy): string {
  if (key === 'matchScore') {
    return i18n.t('sort.matchScore', { defaultValue: 'Match Score' });
  }
  return i18n.t(`sort.${key}`, { defaultValue: key });
}

export function tScenarioLabel(key: ScenarioKey): string {
  return i18n.t(`scenarios.${key}`);
}

export function tScoreLabel(key: string): string {
  return i18n.t(`scores.${key}`, { defaultValue: key });
}

export function tCuisineLabel(key: string): string {
  const normalized = key.toLowerCase().replace(/\s+/g, '_');
  return i18n.t(`cuisines.${normalized}`, { defaultValue: key });
}

export function formatWeekdayHours(line: string): string {
  if (!line) return '';
  const mon = i18n.t('days.monday', { defaultValue: 'Monday' });
  const tue = i18n.t('days.tuesday', { defaultValue: 'Tuesday' });
  const wed = i18n.t('days.wednesday', { defaultValue: 'Wednesday' });
  const thu = i18n.t('days.thursday', { defaultValue: 'Thursday' });
  const fri = i18n.t('days.friday', { defaultValue: 'Friday' });
  const sat = i18n.t('days.saturday', { defaultValue: 'Saturday' });
  const sun = i18n.t('days.sunday', { defaultValue: 'Sunday' });

  let formatted = line;
  formatted = formatted.replace(/\bMonday\b/gi, mon);
  formatted = formatted.replace(/\bTuesday\b/gi, tue);
  formatted = formatted.replace(/\bWednesday\b/gi, wed);
  formatted = formatted.replace(/\bThursday\b/gi, thu);
  formatted = formatted.replace(/\bFriday\b/gi, fri);
  formatted = formatted.replace(/\bSaturday\b/gi, sat);
  formatted = formatted.replace(/\bSunday\b/gi, sun);

  formatted = formatted.replace(/\bMon\b/gi, mon.slice(0, 3));
  formatted = formatted.replace(/\bTue\b/gi, tue.slice(0, 3));
  formatted = formatted.replace(/\bWed\b/gi, wed.slice(0, 3));
  formatted = formatted.replace(/\bThu\b/gi, thu.slice(0, 3));
  formatted = formatted.replace(/\bFri\b/gi, fri.slice(0, 3));
  formatted = formatted.replace(/\bSat\b/gi, sat.slice(0, 3));
  formatted = formatted.replace(/\bSun\b/gi, sun.slice(0, 3));

  formatted = formatted.replace(/\bClosed\b/gi, i18n.t('days.closed', { defaultValue: 'Closed' }));
  formatted = formatted.replace(/\bOpen 24 hours\b/gi, i18n.t('days.open24Hours', { defaultValue: 'Open 24 hours' }));
  formatted = formatted.replace(/\bDaily\b/gi, i18n.t('days.daily', { defaultValue: 'Daily' }));
  return formatted;
}
