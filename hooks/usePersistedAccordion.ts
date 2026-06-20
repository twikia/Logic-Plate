import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export function usePersistedAccordion(key: string, defaultExpanded: boolean = true) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const val = await AsyncStorage.getItem(`accordion_${key}`);
        if (val !== null && mounted) {
          setIsExpanded(val === 'true');
        }
      } catch (e) {
        console.warn(`[usePersistedAccordion] Failed to load ${key}`, e);
      }
    };
    load();
    return () => { mounted = false; };
  }, [key]);

  const toggle = useCallback(async () => {
    setIsExpanded((prev) => {
      const next = !prev;
      AsyncStorage.setItem(`accordion_${key}`, String(next)).catch(e => {
        console.warn(`[usePersistedAccordion] Failed to save ${key}`, e);
      });
      return next;
    });
  }, [key]);

  return { isExpanded, toggle };
}
