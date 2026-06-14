const FUN_HOME_TITLES = [
  'Hungry? Start here',
  'Your top picks nearby',
  'Ready when you are',
  'Made for you boss!',
  "What's good today?",
  "Today's",
  'Picks just for you',
  "Let's find something good",
];

export function pickFunHomeTitle(): string {
  const idx = Math.floor(Math.random() * FUN_HOME_TITLES.length);
  return FUN_HOME_TITLES[idx] ?? FUN_HOME_TITLES[0];
}

const FUN_SELECT_TITLES = [
  'Spin the fork',
  'Decision roulette',
  'Pick your poison',
  'Let fate decide',
  'Eeny, meeny, meal',
  'Trust the shuffle',
  'Commit to chaos',
  'No takebacks',
  'Choose your fighter',
  'RNG says eat',
];

export function pickFunSelectTitle(): string {
  const idx = Math.floor(Math.random() * FUN_SELECT_TITLES.length);
  return FUN_SELECT_TITLES[idx] ?? FUN_SELECT_TITLES[0];
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
