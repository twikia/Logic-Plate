import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import i18n from '@/i18n';
import {
  readLanguageCatalogCache,
  readTranslationCache,
  writeLanguageCatalogCache,
  writeTranslationCache,
} from './resourceCache';
import {
  fetchAppLanguages,
  fetchLanguageCatalogVersion,
  fetchTranslation,
  fetchTranslationVersion,
  type AppLanguage,
} from './remoteResources';

export const BUNDLED_LANGUAGE = 'en';
export type SupportedLanguage = string;

export const FALLBACK_LANGUAGES: AppLanguage[] = [
  { code: 'en', native_name: 'English', english_name: 'English', sort_order: 1 },
  { code: 'zh', native_name: '中文', english_name: 'Chinese (Mandarin)', sort_order: 2 },
  { code: 'hi', native_name: 'हिन्दी', english_name: 'Hindi', sort_order: 3 },
  { code: 'es', native_name: 'Español', english_name: 'Spanish', sort_order: 4 },
  { code: 'fr', native_name: 'Français', english_name: 'French', sort_order: 5 },
  { code: 'ar', native_name: 'العربية', english_name: 'Arabic', sort_order: 6 },
  { code: 'bn', native_name: 'বাংলা', english_name: 'Bengali', sort_order: 7 },
  { code: 'pt', native_name: 'Português', english_name: 'Portuguese', sort_order: 8 },
  { code: 'ru', native_name: 'Русский', english_name: 'Russian', sort_order: 9 },
  { code: 'ur', native_name: 'اردو', english_name: 'Urdu', sort_order: 10 },
  { code: 'id', native_name: 'Bahasa Indonesia', english_name: 'Indonesian', sort_order: 11 },
  { code: 'de', native_name: 'Deutsch', english_name: 'German', sort_order: 12 },
  { code: 'ja', native_name: '日本語', english_name: 'Japanese', sort_order: 13 },
  { code: 'sw', native_name: 'Kiswahili', english_name: 'Swahili', sort_order: 14 },
  { code: 'mr', native_name: 'मराठी', english_name: 'Marathi', sort_order: 15 },
  { code: 'te', native_name: 'తెలుగు', english_name: 'Telugu', sort_order: 16 },
  { code: 'tr', native_name: 'Türkçe', english_name: 'Turkish', sort_order: 17 },
  { code: 'ta', native_name: 'தமிழ்', english_name: 'Tamil', sort_order: 18 },
  { code: 'vi', native_name: 'Tiếng Việt', english_name: 'Vietnamese', sort_order: 19 },
  { code: 'ko', native_name: '한국어', english_name: 'Korean', sort_order: 20 },
  { code: 'it', native_name: 'Italiano', english_name: 'Italian', sort_order: 21 },
  { code: 'th', native_name: 'ไทย', english_name: 'Thai', sort_order: 22 },
  { code: 'gu', native_name: 'ગુજરાતી', english_name: 'Gujarati', sort_order: 23 },
  { code: 'pl', native_name: 'Polski', english_name: 'Polish', sort_order: 24 },
  { code: 'uk', native_name: 'Українська', english_name: 'Ukrainian', sort_order: 25 },
  { code: 'ml', native_name: 'മലയാളം', english_name: 'Malayalam', sort_order: 26 },
  { code: 'kn', native_name: 'ಕನ್ನಡ', english_name: 'Kannada', sort_order: 27 },
  { code: 'pa', native_name: 'ਪੰਜਾਬੀ', english_name: 'Punjabi', sort_order: 28 },
  { code: 'nl', native_name: 'Nederlands', english_name: 'Dutch', sort_order: 29 },
  { code: 'ro', native_name: 'Română', english_name: 'Romanian', sort_order: 30 },
];

let languageCatalog: AppLanguage[] | null = null;
const loadedLanguages = new Set<string>([BUNDLED_LANGUAGE, 'es', 'fr']);

export async function getLanguageCatalog(): Promise<AppLanguage[]> {
  if (languageCatalog) return languageCatalog;

  const cached = await readLanguageCatalogCache();
  if (cached?.rows.length) {
    languageCatalog = cached.rows;
  }

  try {
    const remoteVersion = await fetchLanguageCatalogVersion();
    if (cached && cached.version === remoteVersion && cached.rows.length > 0) {
      return cached.rows;
    }

    const rows = await fetchAppLanguages();
    if (rows.length > 0) {
      await writeLanguageCatalogCache(remoteVersion, rows);
      languageCatalog = rows;
      return rows;
    }
  } catch {
    if (languageCatalog) return languageCatalog;
  }

  languageCatalog = FALLBACK_LANGUAGES;
  return FALLBACK_LANGUAGES;
}

export function getLanguageName(code: string, catalog?: AppLanguage[]): string {
  const list = catalog ?? languageCatalog ?? FALLBACK_LANGUAGES;
  return list.find((row) => row.code === code)?.native_name ?? code;
}

export function resolveDeviceLanguage(catalog: AppLanguage[]): string {
  const codes = new Set(catalog.map((row) => row.code));
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const code = locale.languageCode ?? 'en';
    if (codes.has(code)) return code;
  }
  return BUNDLED_LANGUAGE;
}

function addBundle(lang: string, strings: Record<string, unknown>): void {
  i18n.addResourceBundle(lang, 'translation', strings, true, true);
  loadedLanguages.add(lang);
}

export async function ensureLanguageLoaded(lang: string): Promise<boolean> {
  if (lang === BUNDLED_LANGUAGE) return true;
  if (loadedLanguages.has(lang) && i18n.hasResourceBundle(lang, 'translation')) {
    return true;
  }

  const cached = await readTranslationCache(lang);
  if (cached) {
    addBundle(lang, cached.strings);
  }

  try {
    const remoteVersion = await fetchTranslationVersion(lang);
    if (remoteVersion === null) {
      return loadedLanguages.has(lang);
    }

    if (cached && cached.version === remoteVersion) {
      return true;
    }

    const remote = await fetchTranslation(lang);
    if (!remote) {
      return loadedLanguages.has(lang);
    }

    addBundle(lang, remote.strings);
    await writeTranslationCache(lang, remote.strings, remote.version);
    return true;
  } catch {
    return loadedLanguages.has(lang);
  }
}

export async function changeAppLanguage(lang: string): Promise<boolean> {
  const loaded = await ensureLanguageLoaded(lang);
  if (!loaded && lang !== BUNDLED_LANGUAGE) {
    await i18n.changeLanguage(BUNDLED_LANGUAGE);
    return false;
  }
  await i18n.changeLanguage(lang);
  return true;
}

export async function bootstrapLanguage(savedLang: string | null): Promise<void> {
  const catalog = await getLanguageCatalog();
  const target = savedLang && catalog.some((row) => row.code === savedLang)
    ? savedLang
    : resolveDeviceLanguage(catalog);

  let resolved = target;
  if (target !== BUNDLED_LANGUAGE) {
    const ok = await ensureLanguageLoaded(target);
    if (!ok) resolved = BUNDLED_LANGUAGE;
  }
  if (resolved !== i18n.language) {
    await i18n.changeLanguage(resolved);
  }
}
