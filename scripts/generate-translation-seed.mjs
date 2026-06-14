/**
 * Reads i18n/locales/*.ts and writes JSON files + SQL seed fragments
 * for supabase/migrations. Run: node scripts/generate-translation-seed.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localesDir = path.join(root, 'i18n', 'locales');
const outDir = path.join(root, 'supabase', 'seed', 'translations');

function parseLocaleFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const eq = raw.indexOf('=');
  const start = raw.indexOf('{', eq);
  const end = raw.lastIndexOf('};');
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse locale file: ${filePath}`);
  }
  const body = raw.slice(start, end + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${body})`)();
}

function sqlEscapeJson(obj) {
  return JSON.stringify(obj).replace(/'/g, "''");
}

const langs = ['en', 'es', 'fr'];
fs.mkdirSync(outDir, { recursive: true });

const inserts = [];
for (const lang of langs) {
  const data = parseLocaleFile(path.join(localesDir, `${lang}.ts`));
  fs.writeFileSync(path.join(outDir, `${lang}.json`), JSON.stringify(data, null, 2));
  inserts.push(
    `insert into public.app_translations (lang_code, strings, version)\n` +
      `values ('${lang}', '${sqlEscapeJson(data)}'::jsonb, 1)\n` +
      `on conflict (lang_code) do update set strings = excluded.strings, version = excluded.version, updated_at = now();`
  );
}

const sqlPath = path.join(outDir, '_seed_translations.sql');
fs.writeFileSync(sqlPath, inserts.join('\n\n') + '\n');
console.log(`Wrote ${langs.length} JSON files and ${sqlPath}`);
