#!/usr/bin/env node
/**
 * Enrich AllThePlaces hours (CC-0).
 *
 * Brand-mode (default): print most-common opening_hours per brand to paste into
 *   supabase/functions/_shared/allThePlacesHours.ts
 *
 * Location-mode: upsert per-store hours into v2_atp_place_hours for name+proximity match.
 *
 * Usage:
 *   node scripts/enrich-atp-hours-index.mjs --input path/to/atp.ndjson.gz
 *   node scripts/enrich-atp-hours-index.mjs --url https://.../output.geojson.gz
 *   node scripts/enrich-atp-hours-index.mjs --input atp.ndjson.gz --upsert-locations
 *   node scripts/enrich-atp-hours-index.mjs --input atp.ndjson.gz --upsert-locations --bbox=-74.05,40.68,-73.90,40.85
 *
 * Download weekly dumps from https://alltheplaces.xyz/ (CC-0).
 * Requires EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for --upsert-locations.
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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

function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const out = {
    input: null,
    url: null,
    minCount: 25,
    limit: 80,
    upsertLocations: false,
    bbox: null,
    batchSize: 500,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--min-count') out.minCount = Number(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--upsert-locations') out.upsertLocations = true;
    else if (a === '--bbox') {
      const parts = String(argv[++i]).split(',').map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        out.bbox = { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
      }
    } else if (a === '--batch-size') out.batchSize = Number(argv[++i]);
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

function featureCoords(feature) {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function inBbox(lat, lng, bbox) {
  if (!bbox) return true;
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
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

async function deleteLocationsInBbox(url, key, bbox) {
  if (!bbox) return;
  const filter =
    `and=(lat.gte.${bbox.minLat},lat.lte.${bbox.maxLat},lng.gte.${bbox.minLng},lng.lte.${bbox.maxLng})`;
  const res = await fetch(`${url}/rest/v1/v2_atp_place_hours?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase delete failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function upsertLocationBatch(url, key, rows) {
  const res = await fetch(`${url}/rest/v1/v2_atp_place_hours`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function runBrandMode(args, stream) {
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

async function runLocationUpsert(args, stream) {
  loadEnvFile();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for --upsert-locations');
  }

  if (args.bbox) {
    console.log('[ATP] clearing existing rows in bbox before upsert...');
    await deleteLocationsInBbox(url, key, args.bbox);
  }

  let scanned = 0;
  let kept = 0;
  let uploaded = 0;
  /** @type {Array<{name:string,brand:string|null,lat:number,lng:number,opening_hours:string}>} */
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await upsertLocationBatch(url, key, batch);
    uploaded += batch.length;
    console.log(`[ATP] upserted ${uploaded} location hours rows...`);
    batch = [];
  };

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
    const coords = featureCoords(feature);
    if (!coords) continue;
    if (!inBbox(coords.lat, coords.lng, args.bbox)) continue;
    const name = String(props.name || props.brand || '').trim();
    if (!name) continue;

    kept++;
    batch.push({
      name,
      brand: props.brand ? String(props.brand).trim() : null,
      lat: coords.lat,
      lng: coords.lng,
      opening_hours: hours.trim(),
    });
    if (batch.length >= args.batchSize) await flush();
  }
  await flush();
  console.log(`[ATP] done scanned=${scanned} kept=${kept} uploaded=${uploaded}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const stream = await openSource(args);
  if (args.upsertLocations) {
    await runLocationUpsert(args, stream);
  } else {
    await runBrandMode(args, stream);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
