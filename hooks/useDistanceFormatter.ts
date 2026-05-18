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
      if (meters === 3000) return '1.5 mi';
      const miles = meters * 0.000621371;
      return `${miles.toFixed(1)} mi`;
    } else {
      return `${(meters / 1000).toFixed(1)} km`;
    }
  };

  return { unit, formatDistance, formatLabel };
}
