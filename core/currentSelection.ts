/**
 * In-memory store to pass large objects (like a selected Google Places restaurant)
 * between screens without stringifying them into URL parameters, which causes
 * severe JS bridge blocking and slow transitions.
 */

let currentRestaurant: any = null;

const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
};

export const subscribeCurrentRestaurant = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const setCurrentRestaurant = (restaurant: any) => {
  currentRestaurant = restaurant;
  notify();
};

export const replaceCurrentRestaurantIfInList = (list: any[]) => {
  if (!currentRestaurant?.id) return;
  const next = list.find((p: any) => p?.id === currentRestaurant.id);
  if (next) {
    currentRestaurant = next;
    notify();
  }
};

export const getCurrentRestaurant = () => {
  return currentRestaurant;
};

export const clearCurrentRestaurant = () => {
  currentRestaurant = null;
  notify();
};

let pendingMapFocus: any = null;

export const setMapFocusRestaurant = (restaurant: any) => {
  pendingMapFocus = restaurant;
};

export const consumeMapFocusRestaurant = () => {
  const restaurant = pendingMapFocus;
  pendingMapFocus = null;
  return restaurant;
};
