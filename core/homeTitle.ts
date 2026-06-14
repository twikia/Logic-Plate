import i18n from '@/i18n';

export function pickFunHomeTitle(): string {
  const titles = i18n.t('home.titles', { returnObjects: true }) as string[];
  const arr = Array.isArray(titles) && titles.length > 0 ? titles : ['Your top picks nearby'];
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] ?? arr[0];
}

export function pickFunSelectTitle(): string {
  const titles = i18n.t('home.selectTitles', { returnObjects: true }) as string[];
  const arr = Array.isArray(titles) && titles.length > 0 ? titles : ['Pick your poison'];
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx] ?? arr[0];
}

type RerollListener = () => void;
const rerollListeners = new Set<RerollListener>();

export function onHomeTitleReroll(listener: RerollListener): () => void {
  rerollListeners.add(listener);
  return () => {
    rerollListeners.delete(listener);
  };
}

export function requestHomeTitleReroll(): void {
  rerollListeners.forEach(fn => fn());
}
