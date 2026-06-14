/**
 * Reads supabase/seed/translations/*.json and writes SQL seed for app_languages.
 * Run: node scripts/generate-translation-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'supabase', 'seed', 'translations');

const LANG_ORDER = [
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur',
  'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr', 'ta', 'vi', 'ko',
  'it', 'th', 'gu', 'pl', 'uk', 'ml', 'kn', 'pa', 'nl', 'ro',
];

function sqlEscapeJson(obj) {
  return JSON.stringify(obj).replace(/'/g, "''");
}

const inserts = [];
for (const lang of LANG_ORDER) {
  const jsonPath = path.join(outDir, `${lang}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.warn(`Skipping missing ${lang}.json`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  inserts.push(
    `update public.app_languages\n` +
      `set\n` +
      `  strings = '${sqlEscapeJson(data)}'::jsonb,\n` +
      `  translation_version = 1,\n` +
      `  updated_at = timezone('utc', now())\n` +
      `where code = '${lang}';`
  );
}

const sqlPath = path.join(outDir, '_seed_translations.sql');
fs.writeFileSync(sqlPath, inserts.join('\n\n') + '\n');
console.log(`Wrote ${inserts.length} UPDATE statements to ${sqlPath}`);
