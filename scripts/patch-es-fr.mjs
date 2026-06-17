/**
 * Patches es.ts / fr.ts with missing keys (translated via MyMemory).
 * Run: node scripts/patch-es-fr.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'i18n', 'locales');

function parseLocaleFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const eq = raw.indexOf('=');
  const start = raw.indexOf('{', eq);
  const end = raw.lastIndexOf('};');
  return new Function(`return (${raw.slice(start, end + 1)})`)();
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] ?? {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

async function translate(text, lang) {
  if (!text || typeof text !== 'string' || !/[a-zA-Z]/.test(text)) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.responseData?.translatedText || text;
}

function writeTs(lang, data) {
  const json = JSON.stringify(data, null, 2);
  const body = json.replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
  const content = `import type { Translations } from './en';\n\nconst ${lang}: Translations = ${body};\n\nexport default ${lang};\n`;
  fs.writeFileSync(path.join(localesDir, `${lang}.ts`), content);
}

const enFlat = flatten(parseLocaleFile(path.join(localesDir, 'en.ts')));

for (const lang of ['es', 'fr']) {
  const existing = fs.existsSync(path.join(localesDir, `${lang}.ts`))
    ? flatten(parseLocaleFile(path.join(localesDir, `${lang}.ts`)))
    : {};
  const merged = { ...enFlat, ...existing };
  const missing = Object.keys(enFlat).filter((k) => merged[k] === enFlat[k]);
  console.log(`${lang}: translating ${missing.length} keys...`);
  for (let i = 0; i < missing.length; i++) {
    const k = missing[i];
    merged[k] = await translate(enFlat[k], lang);
    if (i % 20 === 0) console.log(`  ${i}/${missing.length}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  writeTs(lang, unflatten(merged));
  console.log(`Wrote ${lang}.ts`);
}
