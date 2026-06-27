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
  const dayNames: Record<string, string> = {
    Monday: i18n.t('days.monday', { defaultValue: 'Monday' }),
    Tuesday: i18n.t('days.tuesday', { defaultValue: 'Tuesday' }),
    Wednesday: i18n.t('days.wednesday', { defaultValue: 'Wednesday' }),
    Thursday: i18n.t('days.thursday', { defaultValue: 'Thursday' }),
    Friday: i18n.t('days.friday', { defaultValue: 'Friday' }),
    Saturday: i18n.t('days.saturday', { defaultValue: 'Saturday' }),
    Sunday: i18n.t('days.sunday', { defaultValue: 'Sunday' }),
  };
  let formatted = line;
  for (const [enDay, locDay] of Object.entries(dayNames)) {
    if (formatted.startsWith(enDay)) {
      formatted = formatted.replace(enDay, locDay);
      break;
    }
  }
  formatted = formatted.replace(/Closed/i, i18n.t('days.closed', { defaultValue: 'Closed' }));
  formatted = formatted.replace(/Open 24 hours/i, i18n.t('days.open24Hours', { defaultValue: 'Open 24 hours' }));
  return formatted;
}
