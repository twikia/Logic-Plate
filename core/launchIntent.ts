export type LaunchIntentCategory = 'cafe_drinks' | 'nice_meal' | 'quick_casual' | 'health_macros';

let currentLaunchIntent: LaunchIntentCategory | null = null;
const listeners = new Set<() => void>();

export const subscribeLaunchIntent = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setLaunchIntent = (intent: LaunchIntentCategory) => {
  currentLaunchIntent = intent;
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
};

export const getLaunchIntent = () => currentLaunchIntent;
