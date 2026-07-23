#!/usr/bin/env node
/**
 * Bulk-ingest official Overture Places (GeoParquet on S3) into v2_restaurant_cell_cache.
 *
 * Free path that bypasses the third-party REST wrapper — queries only the bbox
 * you ask for via DuckDB + httpfs (no AWS credentials needed for the public bucket).
 *
 * Prerequisites:
 *   - DuckDB CLI on PATH (https://duckdb.org/docs/installation/)
 *   - EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env)
 *   - npm package h3-js (already a project dependency)
 *
 * Usage:
 *   node scripts/ingest-overture-bbox.mjs --bbox=-74.05,40.68,-73.90,40.85
 *   node scripts/ingest-overture-bbox.mjs --lat=40.74 --lng=-73.99 --radius-km=5
 *   node scripts/ingest-overture-bbox.mjs --bbox=... --dry-run
 *
 * Release defaults to the STAC "latest" pointer, or --release=2026-06-17.0
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const FOOD_CATEGORIES = [
  'restaurant', 'fast_food_restaurant', 'cafe', 'coffee_shop', 'tea_house',
  'bar', 'cocktail_bar', 'lounge', 'wine_bar', 'pub', 'beer_garden', 'sports_bar',
  'brewery', 'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop',
  'hot_dog_restaurant', 'food_court', 'food_truck', 'deli', 'bagel_shop',
  'ice_cream_shop', 'bakery', 'dessert_shop', 'dessert_restaurant', 'donut_shop',
  'steak_house', 'fine_dining_restaurant', 'buffet_restaurant', 'diner',
  'seafood_restaurant', 'american_restaurant', 'barbecue_restaurant',
  'breakfast_restaurant', 'brunch_restaurant', 'italian_restaurant',
  'japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant', 'poke_restaurant',
  'korean_restaurant', 'chinese_restaurant', 'vietnamese_restaurant', 'thai_restaurant',
  'indian_restaurant', 'mexican_restaurant', 'mediterranean_restaurant',
  'greek_restaurant', 'middle_eastern_restaurant', 'lebanese_restaurant',
  'turkish_restaurant', 'french_restaurant', 'spanish_restaurant', 'tapas_restaurant',
  'chicken_restaurant', 'health_food_restaurant', 'salad_shop', 'vegetarian_restaurant',
  'vegan_restaurant', 'juice_shop', 'acai_shop', 'smoothie_bar', 'food_and_drink',
  'meal_takeaway', 'meal_delivery',
];

function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const out = {
    bbox: null,
    lat: null,
    lng: null,
    radiusKm: 5,
    release: null,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bbox') out.bbox = argv[++i];
    else if (a === '--lat') out.lat = Number(argv[++i]);
    else if (a === '--lng') out.lng = Number(argv[++i]);
    else if (a === '--radius-km') out.radiusKm = Number(argv[++i]);
    else if (a === '--release') out.release = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function bboxFromArgs(args) {
  if (args.bbox) {
    const parts = args.bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new Error('--bbox must be xmin,ymin,xmax,ymax');
    }
    return { xmin: parts[0], ymin: parts[1], xmax: parts[2], ymax: parts[3] };
  }
  if (Number.isFinite(args.lat) && Number.isFinite(args.lng)) {
    const dLat = args.radiusKm / 111;
    const dLng = args.radiusKm / (111 * Math.cos((args.lat * Math.PI) / 180));
    return {
      xmin: args.lng - dLng,
      ymin: args.lat - dLat,
      xmax: args.lng + dLng,
      ymax: args.lat + dLat,
    };
  }
  throw new Error('Provide --bbox=xmin,ymin,xmax,ymax or --lat/--lng/--radius-km');
}

async function resolveRelease(explicit) {
  if (explicit) return explicit;
  try {
    const res = await fetch('https://stac.overturemaps.org/catalog.json');
    if (res.ok) {
      const json = await res.json();
      if (typeof json.latest === 'string' && json.latest) return json.latest;
    }
  } catch {
    // fall through
  }
  return '2026-06-17.0';
}

function normalizePlace(row) {
  const id = row.id;
  const name = row.name;
  if (!id || !name) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const category = row.category || 'restaurant';
  const weekdayDescriptions = Array.isArray(row.weekday_descriptions)
    ? row.weekday_descriptions
    : null;

  return {
    id,
    name,
    category,
    website_url: row.website || null,
    phone: row.phone || null,
    address: row.address || null,
    city: row.locality || null,
    region: row.region || null,
    postcode: row.postcode || null,
    country: row.country || null,
    operating_status: 'open',
    businessStatus: 'OPERATIONAL',
    priceTier: null,
    regularOpeningHours:
      weekdayDescriptions && weekdayDescriptions.length === 7
        ? { weekdayDescriptions }
        : null,
    brand: row.brand || null,
    wikidata: row.wikidata || null,
    sources: row.sources ? [{ dataset: String(row.sources) }] : null,
    attributes: [],
    location: { latitude: lat, longitude: lng },
  };
}

async function upsertCells(cellMap, { dryRun }) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const rows = [...cellMap.entries()].map(([id, restaurants]) => ({
    id,
    restaurants,
    fetched_at: new Date().toISOString(),
  }));

  console.log(`Prepared ${rows.length} H3 cells, ${rows.reduce((n, r) => n + r.restaurants.length, 0)} places`);
  if (dryRun) {
    console.log('[dry-run] Skipping Supabase upsert');
    return;
  }

  const chunkSize = 25;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${url}/rest/v1/v2_restaurant_cell_cache?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase upsert failed (${res.status}): ${text.slice(0, 400)}`);
    }
    console.log(`Upserted cells ${i + 1}-${Math.min(i + chunkSize, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv);
  const bbox = bboxFromArgs(args);
  const release = await resolveRelease(args.release);
  const { geoToH3 } = require('h3-js');

  const categoriesSql = FOOD_CATEGORIES.map((c) => `'${c}'`).join(', ');
  const parquet = `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*`;

  console.log(`Release: ${release}`);
  console.log(`BBox: ${bbox.xmin},${bbox.ymin} → ${bbox.xmax},${bbox.ymax}`);

  const outFile = join(tmpdir(), `overture-places-${Date.now()}.json`);
  const sql = `
INSTALL httpfs; LOAD httpfs;
SET s3_region='us-west-2';
SET s3_url_style='path';
COPY (
  SELECT
    id,
    names.primary AS name,
    COALESCE(categories.primary, 'restaurant') AS category,
    websites[1] AS website,
    phones[1] AS phone,
    addresses[1].freeform AS address,
    addresses[1].locality AS locality,
    addresses[1].region AS region,
    addresses[1].postcode AS postcode,
    addresses[1].country AS country,
    brand.names.common[1].value AS brand,
    brand.wikidata AS wikidata,
    sources[1].dataset AS sources,
    (bbox.ymin + bbox.ymax) / 2.0 AS lat,
    (bbox.xmin + bbox.xmax) / 2.0 AS lng
  FROM read_parquet('${parquet}', hive_partitioning=1)
  WHERE bbox.xmin <= ${bbox.xmax}
    AND bbox.xmax >= ${bbox.xmin}
    AND bbox.ymin <= ${bbox.ymax}
    AND bbox.ymax >= ${bbox.ymin}
    AND categories.primary IN (${categoriesSql})
) TO '${outFile.replace(/\\/g, '/')}' (FORMAT JSON, ARRAY true);
`;

  console.log('Querying Overture GeoParquet via DuckDB (this may take a few minutes)...');
  const probe = spawnSync('duckdb', ['-c', sql], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (probe.error) {
    throw new Error(
      `DuckDB CLI not found (${probe.error.message}). Install from https://duckdb.org/docs/installation/`,
    );
  }
  if (probe.status !== 0) {
    throw new Error(`DuckDB failed:\n${probe.stderr || probe.stdout}`);
  }

  const raw = JSON.parse(readFileSync(outFile, 'utf8'));
  try { unlinkSync(outFile); } catch { /* ignore */ }

  const rows = Array.isArray(raw) ? raw : [];
  console.log(`DuckDB returned ${rows.length} food places`);

  /** @type {Map<string, any[]>} */
  const cellMap = new Map();
  for (const row of rows) {
    const place = normalizePlace(row);
    if (!place) continue;
    const cellId = geoToH3(place.location.latitude, place.location.longitude, 7);
    if (!cellMap.has(cellId)) cellMap.set(cellId, []);
    const bucket = cellMap.get(cellId);
    if (bucket.some((p) => p.id === place.id)) continue;
    bucket.push(place);
  }

  await upsertCells(cellMap, { dryRun: args.dryRun });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
