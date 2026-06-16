/**
 * Generates SQL + JSON seeds for all 30 languages from locale files.
 * en/es/fr use real translations; others copy English until manually translated.
 * Run: node scripts/generate-all-language-seeds.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localesDir = path.join(root, 'i18n', 'locales');
const outDir = path.join(root, 'supabase', 'seed', 'translations');

const ALL_LANGS = [
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur',
  'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr', 'ta', 'vi', 'ko',
  'it', 'th', 'gu', 'pl', 'uk', 'ml', 'kn', 'pa', 'nl', 'ro',
];

const LOCALE_FILES = new Set(['en', 'es', 'fr']);

function parseLocaleFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.includes("from './fr.data.json'")) {
    const jsonPath = filePath.replace(/\.ts$/, '.data.json');
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  const eq = raw.indexOf('=');
  const start = raw.indexOf('{', eq);
  const end = raw.lastIndexOf('};');
  if (start === -1 || end === -1) throw new Error(`Could not parse: ${filePath}`);
  return new Function(`return (${raw.slice(start, end + 1)})`)();
}

function sqlEscapeJson(obj) {
  return JSON.stringify(obj).replace(/'/g, "''");
}

fs.mkdirSync(outDir, { recursive: true });

const enData = parseLocaleFile(path.join(localesDir, 'en.ts'));

const statements = [
  '-- Populates strings for all 30 app_languages rows.',
  '-- en/es/fr use locale files; others copy English (translate via DB or replace JSON).',
  '',
];

for (const code of ALL_LANGS) {
  let data;
  const localePath = path.join(localesDir, `${code}.ts`);
  if (LOCALE_FILES.has(code) && fs.existsSync(localePath)) {
    data = parseLocaleFile(localePath);
    console.log(`${code}: locale file`);
  } else {
    data = structuredClone(enData);
    console.log(`${code}: English fallback`);
  }

  fs.writeFileSync(path.join(outDir, `${code}.json`), JSON.stringify(data, null, 2));

  statements.push(
    `update public.app_languages\n` +
      `set strings = '${sqlEscapeJson(data)}'::jsonb,\n` +
      `    translation_version = 2,\n` +
      `    updated_at = timezone('utc', now())\n` +
      `where code = '${code}';`,
    ''
  );
}

const sqlPath = path.join(root, 'supabase', 'migrations', '20260615120000_sync_all_translations.sql');
fs.writeFileSync(sqlPath, statements.join('\n'));
console.log(`Wrote ${ALL_LANGS.length} JSON files and ${sqlPath}`);
