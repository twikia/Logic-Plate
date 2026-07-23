#!/usr/bin/env node
/**
 * Enrich AllThePlaces chain hours index (CC-0).
 *
 * Usage:
 *   node scripts/enrich-atp-hours-index.mjs --input path/to/atp.ndjson.gz
 *   node scripts/enrich-atp-hours-index.mjs --input path/to/atp.ndjson
 *   node scripts/enrich-atp-hours-index.mjs --url https://.../output.geojson.gz
 *
 * Reads ATP GeoJSON/NDJSON features, keeps rows with opening_hours + a food-ish
 * amenity, groups by brand/name, and prints the most common OSM opening_hours
 * string per brand. Paste high-confidence rows into:
 *   supabase/functions/_shared/allThePlacesHours.ts
 *
 * Download weekly dumps from https://alltheplaces.xyz/ (CC-0).
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

const FOOD_AMENITIES = new Set([
  'restaurant',
  'fast_food',
  'cafe',
  'bar',
  'pub',
  'biergarten',
  'ice_cream',
  'food_court',
  'bakery',
  'bbq',
  'bistro',
]);

function parseArgs(argv) {
  const out = { input: null, url: null, minCount: 25, limit: 80 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--min-count') out.minCount = Number(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]);
  }
  return out;
}

function brandKey(props) {
  const brand = String(props.brand || props.nsi_id || props.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return brand.slice(0, 60);
}

function isFoodFeature(props) {
  const amenity = String(props.amenity || props.shop || '').toLowerCase();
  if (FOOD_AMENITIES.has(amenity)) return true;
  const cuisine = props.cuisine;
  if (cuisine) return true;
  const cats = String(props['@spider'] || props.nsi_id || '').toLowerCase();
  return /restaurant|burger|pizza|cafe|coffee|taco|chicken|donut|subway|starbucks/.test(cats);
}

async function* iterateLines(stream) {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield trimmed;
  }
}

async function openSource({ input, url }) {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ATP URL: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const isGz = url.endsWith('.gz') || buf[0] === 0x1f;
    const readable = Readable.from(buf);
    return isGz ? readable.pipe(createGunzip()) : readable;
  }
  if (!input) {
    throw new Error('Pass --input <file.ndjson[.gz]> or --url <https://...>');
  }
  const stream = createReadStream(input);
  return input.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
}

async function main() {
  const args = parseArgs(process.argv);
  const stream = await openSource(args);
  /** @type {Map<string, Map<string, number>>} */
  const brandHours = new Map();
  let scanned = 0;
  let kept = 0;

  for await (const line of iterateLines(stream)) {
    scanned++;
    let feature;
    try {
      feature = JSON.parse(line);
    } catch {
      continue;
    }
    const props = feature.properties || feature;
    if (!isFoodFeature(props)) continue;
    const hours = props.opening_hours;
    if (typeof hours !== 'string' || !hours.trim()) continue;
    const key = brandKey(props);
    if (!key || key.length < 3) continue;

    kept++;
    if (!brandHours.has(key)) brandHours.set(key, new Map());
    const counts = brandHours.get(key);
    counts.set(hours.trim(), (counts.get(hours.trim()) || 0) + 1);
  }

  const ranked = [];
  for (const [brand, counts] of brandHours) {
    let bestHours = '';
    let bestCount = 0;
    let total = 0;
    for (const [hours, count] of counts) {
      total += count;
      if (count > bestCount) {
        bestCount = count;
        bestHours = hours;
      }
    }
    if (total < args.minCount) continue;
    ranked.push({ brand, hours: bestHours, count: bestCount, total });
  }

  ranked.sort((a, b) => b.total - a.total);
  const top = ranked.slice(0, args.limit);

  console.log(`# ATP food chain hours (scanned=${scanned}, kept=${kept}, brands=${top.length})`);
  console.log('# Paste into CHAIN_OPENING_HOURS in allThePlacesHours.ts\n');
  for (const row of top) {
    const needle = row.brand.replace(/'/g, "\\'");
    const hours = row.hours.replace(/'/g, "\\'");
    console.log(`  { needle: '${needle}', hours: '${hours}' }, // n=${row.total}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
