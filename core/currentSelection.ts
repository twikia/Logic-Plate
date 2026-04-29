/**
 * In-memory store to pass large objects (like a selected Google Places restaurant)
 * between screens without stringifying them into URL parameters, which causes
 * severe JS bridge blocking and slow transitions.
 */

let currentRestaurant: any = null;

export const setCurrentRestaurant = (restaurant: any) => {
  currentRestaurant = restaurant;
};

export const getCurrentRestaurant = () => {
  return currentRestaurant;
};

export const clearCurrentRestaurant = () => {
  currentRestaurant = null;
};
