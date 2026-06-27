import { useState, useEffect } from 'react';
import i18n from '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryCache = new Map<string, string>();

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function fetchLiveTranslation(text: string, targetLang: string): Promise<string> {
  const raw = text?.trim();
  if (!raw || targetLang.startsWith('en')) return raw || '';

  const cacheKey = `${targetLang}:${raw}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  try {
    const asyncKey = `live_tr_${targetLang}_${hashCode(raw)}`;
    const stored = await AsyncStorage.getItem(asyncKey);
    if (stored) {
      memoryCache.set(cacheKey, stored);
      return stored;
    }
  } catch {}

  // 1. Google Translate Public Client API (free, realtime)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(raw)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      let translated = '';
      if (Array.isArray(data) && Array.isArray(data[0])) {
        for (const part of data[0]) {
          if (Array.isArray(part) && typeof part[0] === 'string') {
            translated += part[0];
          }
        }
      }
      if (translated) {
        memoryCache.set(cacheKey, translated);
        try {
          await AsyncStorage.setItem(`live_tr_${targetLang}_${hashCode(raw)}`, translated);
        } catch {}
        return translated;
      }
    }
  } catch {}

  // 2. Fallback MyMemory API
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(raw)}&langpair=en|${targetLang}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === 'string' && !translated.includes('MYMEMORY')) {
        memoryCache.set(cacheKey, translated);
        try {
          await AsyncStorage.setItem(`live_tr_${targetLang}_${hashCode(raw)}`, translated);
        } catch {}
        return translated;
      }
    }
  } catch {}

  return raw;
}

export function useLiveTranslation(text: string | undefined | null): string {
  const lang = i18n.language || 'en';
  const raw = text?.trim() || '';

  const [translated, setTranslated] = useState<string>(() => {
    if (!raw || lang.startsWith('en')) return raw;
    const cacheKey = `${lang}:${raw}`;
    return memoryCache.get(cacheKey) || raw;
  });

  useEffect(() => {
    if (!raw) {
      setTranslated('');
      return;
    }
    if (lang.startsWith('en')) {
      setTranslated(raw);
      return;
    }
    const cacheKey = `${lang}:${raw}`;
    if (memoryCache.has(cacheKey)) {
      setTranslated(memoryCache.get(cacheKey)!);
      return;
    }

    let active = true;
    fetchLiveTranslation(raw, lang).then(res => {
      if (active) setTranslated(res);
    });

    return () => {
      active = false;
    };
  }, [raw, lang]);

  return translated;
}
