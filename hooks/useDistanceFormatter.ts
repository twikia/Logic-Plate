import { useState, useEffect } from 'react';
import { getDistanceUnit, DistanceUnit } from '@/core/userSettings';
import { useIsFocused } from '@react-navigation/native';

export function useDistanceFormatter() {
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      getDistanceUnit().then(setUnit);
    }
  }, [isFocused]);

  const formatDistance = (meters: number): string => {
    if (unit === 'mi') {
      const miles = meters * 0.000621371;
      if (miles < 0.1) return `${Math.round(meters * 3.28084)}ft`;
      return `${miles.toFixed(1)}mi`;
    } else {
      if (meters < 1000) return `${Math.round(meters)}m`;
      return `${(meters / 1000).toFixed(1)}km`;
    }
  };

  const formatLabel = (meters: number): string => {
    if (unit === 'mi') {
      const miles = meters * 0.000621371;
      return `${miles.toFixed(1)} mi`;
    } else {
      return `${(meters / 1000).toFixed(1)} km`;
    }
  };

  /** Brisk walk (~6.2 km/h) — slightly faster than typical map walking ETA. */
  const formatWalkingTime = (meters: number): string => {
    const m = Math.max(0, Math.round(meters));
    if (m < 80) return '< 1 min walk';
    const mins = Math.floor(m / (6200 / 60));
    if (mins < 1) return '< 1 min walk';
    return `${mins} min walk`;
  };

  return { unit, formatDistance, formatLabel, formatWalkingTime };
}
