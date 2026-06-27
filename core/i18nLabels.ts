import i18n from '@/i18n';
import type { RandomSortBy } from './randomPickerState';
import type { ScenarioKey } from './scenarioFilters';

export function tSortLabel(key: RandomSortBy): string {
  if (key === 'matchScore') {
    return i18n.t('matchScore', { defaultValue: 'Match Score' });
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
