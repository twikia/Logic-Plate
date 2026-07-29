import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import {
  extractOsmField,
  parseOsmPriceRange,
} from "../_shared/osmOpeningHours.ts";
import { lookupBrandPriceTier } from "../_shared/brandPriceTiers.ts";
import {
  CELL_CACHE_TTL_MS,
  FOOD_CATEGORIES as FOOD_CATEGORY_LIST,
  evaluatePlaceQuality,
  isSocialOrDeliveryUrl,
  type QualityRejectReason,
} from "../_shared/overtureQuality.ts";
import {
  atpBboxDeltaDegrees,
  resolveOpeningHours,
  type AtpPlaceHoursRow,
} from "../_shared/allThePlacesHours.ts";
import { secretsEqual } from "../_shared/security.ts";
import { logIssue, pct } from "../_shared/issueLog.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

// ─── Overture Maps API Config ─────────────────────────────────────────────────
// REST API: GET https://api.overturemapsapi.com/places
// Auth: x-api-key header
// Params: lat, lng, radius (meters), categories (comma-separated), limit
// Returns: { features: [{ id (GERS), properties: { name, categories, websites, addresses, ... } }] }

const OVERTURE_API_BASE = 'https://api.overturemapsapi.com/places';

// H3 res-7 inscribed radius (apothem) = edge × √3/2 — mirrors core/searchConfig.ts
const OVERTURE_SEARCH_RADIUS_METERS = 1057.052559;

const MAX_RESULTS_PER_CELL = 1500;

type RejectReason = QualityRejectReason;
type RejectedPlace = { gers_id: string; reason: RejectReason };

const FOOD_CATEGORIES = FOOD_CATEGORY_LIST.join(',');

const CACHE_TTL_MS = CELL_CACHE_TTL_MS;

const OVERTURE_MAX_RETRIES = 3;
const OVERTURE_RETRY_BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOvertureRateLimited(status: number): boolean {
  return status === 429 || status === 503;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OvertureFeature = {
  id: string;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    names?: {
      primary?: string;
      common?: Record<string, string>;
    };
    categories?: {
      primary?: string;
      alternate?: string[];
    };
    basic_category?: string;
    taxonomy?: {
      primary?: string;
      alternate?: string[];
      hierarchy?: string[];
    };
    confidence?: number;
    websites?: unknown;
    website?: unknown;
    phones?: unknown;
    addresses?: Array<{
      freeform?: string;
      locality?: string;
      postcode?: string;
      region?: string;
      country?: string;
    }>;
    socials?: unknown;
    emails?: string[];
    brand?: {
      names?: { common?: Array<{ value: string; language?: string }> };
      wikidata?: string;
    };
    sources?: Array<{ property?: string; dataset?: string; record_id?: string }>;
    operating_status?: string;
    opening_hours?: unknown;
    hours?: unknown;
    price_range?: unknown;
    price_rating?: unknown;
    tags?: Record<string, unknown>;
  };
};

type OvertureApiResponse = {
  features?: OvertureFeature[];
  type?: string;
};

function parseOvertureFeatures(raw: unknown): OvertureFeature[] {
  if (Array.isArray(raw)) return raw as OvertureFeature[];
  if (raw && typeof raw === 'object') {
    const features = (raw as OvertureApiResponse).features;
    if (Array.isArray(features)) return features;
  }
  return [];
}

function jsonErrorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ error: message, code, statusCode: status, ...extra }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

type NormalizedPlace = {
  id: string;
  name: string;
  category: string;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  operating_status: string;
  businessStatus: string;
  priceTier: number | null;
  regularOpeningHours: { weekdayDescriptions: string[] } | null;
  brand: string | null;
  wikidata: string | null;
  sources: Array<{ property?: string; dataset?: string; record_id?: string }> | null;
  /** All non-core Overture facts as prompt-ready lines (names, categories, tags, brand, socials, etc.). */
  attributes: string[];
  confidence: number | null;
  location: {
    latitude: number;
    longitude: number;
  };
};

function mapOperatingStatus(raw: string | undefined): { operating_status: string; businessStatus: string } {
  if (raw == null || String(raw).trim() === '') {
    return { operating_status: 'unknown', businessStatus: 'UNKNOWN' };
  }
  const normalized = String(raw).toLowerCase().trim();
  if (normalized === 'permanently_closed') {
    return { operating_status: 'permanently_closed', businessStatus: 'CLOSED_PERMANENTLY' };
  }
  if (normalized === 'temporarily_closed') {
    return { operating_status: 'temporarily_closed', businessStatus: 'CLOSED_TEMPORARILY' };
  }
  if (normalized === 'open') {
    return { operating_status: 'open', businessStatus: 'OPERATIONAL' };
  }
  return { operating_status: 'unknown', businessStatus: 'UNKNOWN' };
}

async function upsertRejectedPlaces(
  supabase: ReturnType<typeof createClient>,
  rejected: RejectedPlace[],
): Promise<void> {
  if (rejected.length === 0) return;
  const { error } = await supabase.from('v2_rejected_places').upsert(
    rejected.map((r) => ({ gers_id: r.gers_id, reason: r.reason })),
    { onConflict: 'gers_id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn(`[v2-fetch-restaurants] Rejected-places upsert error: ${error.message}`);
  }
}

async function loadRejectedIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('v2_rejected_places')
      .select('gers_id')
      .in('gers_id', chunk);
    if (error) {
      console.warn(`[v2-fetch-restaurants] Rejected-places read error: ${error.message}`);
      break;
    }
    for (const row of data ?? []) {
      if (typeof row?.gers_id === 'string') out.add(row.gers_id);
    }
  }
  return out;
}

/** Apply hard quality gates; reject reasons are tombstoned. */
function filterEnrichAndRejectPlaces(
  places: NormalizedPlace[],
): { kept: NormalizedPlace[]; rejected: RejectedPlace[] } {
  const rejected: RejectedPlace[] = [];
  const kept: NormalizedPlace[] = [];
  for (const place of places) {
    const verdict = evaluatePlaceQuality({
      name: place.name,
      category: place.category,
      website_url: place.website_url,
      phone: place.phone,
      address: place.address,
      operating_status: place.operating_status,
      businessStatus: place.businessStatus,
      confidence: place.confidence,
      sources: place.sources,
    });
    if (!verdict.ok) {
      rejected.push({ gers_id: place.id, reason: verdict.reason });
    } else {
      kept.push(place);
    }
  }
  console.log(
    `[v2-fetch-restaurants] Quality filter: ${kept.length} kept, ${rejected.length} rejected`
  );
  return { kept, rejected };
}

function attachOpeningHours(
  places: NormalizedPlace[],
  atpRows: AtpPlaceHoursRow[],
): NormalizedPlace[] {
  return places.map((place) => {
    if ((place.regularOpeningHours?.weekdayDescriptions?.length ?? 0) === 7) {
      return place;
    }
    const days = resolveOpeningHours({
      name: place.name,
      brand: place.brand,
      lat: place.location.latitude,
      lng: place.location.longitude,
      atpRows,
    });
    if (days.length !== 7) return place;
    return {
      ...place,
      regularOpeningHours: { weekdayDescriptions: days },
    };
  });
}

async function loadAtpHoursNearby(
  supabase: ReturnType<typeof createClient>,
  lat: number,
  lng: number,
  radiusMeters = 1200,
): Promise<AtpPlaceHoursRow[]> {
  const delta = atpBboxDeltaDegrees(radiusMeters);
  const { data, error } = await supabase
    .from('v2_atp_place_hours')
    .select('name, brand, lat, lng, opening_hours')
    .gte('lat', lat - delta)
    .lte('lat', lat + delta)
    .gte('lng', lng - delta)
    .lte('lng', lng + delta)
    .limit(800);
  if (error) {
    console.warn(`[v2-fetch-restaurants] ATP hours lookup skipped: ${error.message}`);
    return [];
  }
  return (data ?? []).filter(
    (row): row is AtpPlaceHoursRow =>
      typeof row?.name === 'string' &&
      typeof row?.opening_hours === 'string' &&
      typeof row?.lat === 'number' &&
      typeof row?.lng === 'number',
  );
}

// ─── Normalizer helpers ───────────────────────────────────────────────────────

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.hostname === 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrlFromEntry(entry: unknown): string | null {
  if (typeof entry === 'string') return normalizeWebsiteUrl(entry);
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    for (const key of ['url', 'value', 'uri', 'href']) {
      if (typeof obj[key] === 'string') {
        const normalized = normalizeWebsiteUrl(obj[key] as string);
        if (normalized) return normalized;
      }
    }
  }
  return null;
}

function extractWebsiteUrl(props: OvertureFeature['properties']): string | null {
  const candidates: unknown[] = [];
  if (Array.isArray(props.websites)) candidates.push(...props.websites);
  if (props.website != null) candidates.push(props.website);
  if (Array.isArray(props.socials)) candidates.push(...props.socials);

  for (const entry of candidates) {
    const url = extractUrlFromEntry(entry);
    if (url && !isSocialOrDeliveryUrl(url)) return url;
  }

  return null;
}

function extractPhone(props: OvertureFeature['properties']): string | null {
  const phones = props.phones;
  if (!phones) return null;
  if (typeof phones === 'string') return phones.trim() || null;
  if (Array.isArray(phones)) {
    for (const entry of phones) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim();
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.phone === 'string' && obj.phone.trim()) return obj.phone.trim();
        if (typeof obj.value === 'string' && obj.value.trim()) return obj.value.trim();
      }
    }
  }
  return null;
}

function extractPlaceName(props: OvertureFeature['properties']): string {
  if (props.name?.trim()) return props.name.trim();
  if (props.names?.primary?.trim()) return props.names.primary.trim();
  const common = props.names?.common;
  if (common && typeof common === 'object') {
    for (const value of Object.values(common)) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

function formatOvertureValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(item => formatOvertureValue(item))
      .filter((v): v is string => !!v);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}

function collectStringValues(value: unknown, out: string[]): void {
  if (typeof value === 'string' && value.trim()) {
    out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['url', 'value', 'uri', 'href', 'phone', 'email']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).trim()) {
        out.push((obj[key] as string).trim());
        return;
      }
    }
    for (const nested of Object.values(obj)) collectStringValues(nested, out);
  }
}

/** Dump every useful Overture property as prompt-ready facts (no cherry-picking). */
function extractAttributes(props: OvertureFeature['properties']): string[] {
  const attrs: string[] = [];
  const push = (label: string, value: unknown) => {
    const formatted = formatOvertureValue(value);
    if (formatted) attrs.push(`${label}: ${formatted}`);
  };

  if (props.names?.primary && props.names.primary.trim() !== props.name?.trim()) {
    push('Primary name', props.names.primary);
  }
  if (props.names?.common && typeof props.names.common === 'object') {
    const commonNames = Object.entries(props.names.common)
      .map(([lang, value]) => (typeof value === 'string' && value.trim() ? `${value.trim()} (${lang})` : null))
      .filter((v): v is string => !!v);
    if (commonNames.length > 0) push('Alternate names', commonNames.join('; '));
  }

  push('Basic category', props.basic_category);
  push('Category primary', props.categories?.primary);
  if (props.categories?.alternate?.length) push('Category alternate', props.categories.alternate);
  push('Taxonomy primary', props.taxonomy?.primary);
  if (props.taxonomy?.alternate?.length) push('Taxonomy alternate', props.taxonomy.alternate);

  if (typeof props.confidence === 'number' && Number.isFinite(props.confidence)) {
    push('Overture confidence', props.confidence);
  }

  const addr = props.addresses?.[0];
  if (addr) {
    push('Address freeform', addr.freeform);
    push('Locality', addr.locality);
    push('Region', addr.region);
    push('Postcode', addr.postcode);
    push('Country code', addr.country);
  }
  if (Array.isArray(props.addresses) && props.addresses.length > 1) {
    push('Additional addresses', props.addresses.slice(1).map(a =>
      [a.freeform, a.locality, a.region, a.postcode, a.country].filter(Boolean).join(', ')
    ).filter(Boolean));
  }

  const phones: string[] = [];
  collectStringValues(props.phones, phones);
  if (phones.length > 1) push('Additional phones', [...new Set(phones)].slice(1));

  const websites: string[] = [];
  collectStringValues(props.websites, websites);
  collectStringValues(props.website, websites);
  const uniqueWebsites = [...new Set(websites)];
  if (uniqueWebsites.length > 1) push('Additional websites', uniqueWebsites.slice(1));

  const socials: string[] = [];
  collectStringValues(props.socials, socials);
  if (socials.length > 0) push('Socials', [...new Set(socials)]);

  if (Array.isArray(props.emails) && props.emails.length > 0) {
    push('Emails', props.emails.filter(e => typeof e === 'string' && e.trim()));
  }

  const brandNames = props.brand?.names?.common
    ?.map(n => n?.value?.trim())
    .filter((v): v is string => !!v);
  if (brandNames && brandNames.length > 0) push('Brand', brandNames);
  if (props.brand?.wikidata) push('Brand Wikidata', props.brand.wikidata);

  push('Operating status raw', props.operating_status);
  push('Price range raw', props.price_range ?? props.price_rating);

  if (Array.isArray(props.sources) && props.sources.length > 0) {
    const datasets = [...new Set(
      props.sources
        .map(s => [s.dataset, s.property].filter(Boolean).join(':'))
        .filter(Boolean)
    )];
    if (datasets.length > 0) push('Sources', datasets);
  }

  if (props.tags && typeof props.tags === 'object') {
    const tagEntries = Object.entries(props.tags as Record<string, unknown>)
      .map(([key, value]) => {
        const formatted = formatOvertureValue(value);
        return formatted ? `${key}=${formatted}` : null;
      })
      .filter((v): v is string => !!v)
      .sort();
    if (tagEntries.length > 0) push('OSM tags', tagEntries.join('; '));
  }

  return attrs;
}

function extractBrandName(props: OvertureFeature['properties']): string | null {
  const common = props.brand?.names?.common;
  if (Array.isArray(common)) {
    for (const entry of common) {
      if (typeof entry?.value === 'string' && entry.value.trim()) return entry.value.trim();
    }
  }
  return null;
}

type NormalizeOutcome =
  | { kind: 'place'; place: NormalizedPlace }
  | { kind: 'reject'; gers_id: string; reason: RejectReason }
  | { kind: 'skip' };

function normalizeOvertureFeature(feature: OvertureFeature): NormalizeOutcome {
  if (!feature?.id || !feature?.geometry?.coordinates) return { kind: 'skip' };

  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return { kind: 'skip' };

  const props = feature.properties ?? {};
  const name = extractPlaceName(props);
  if (!name) return { kind: 'skip' };

  const status = mapOperatingStatus(props.operating_status);
  const confidence =
    typeof props.confidence === 'number' && Number.isFinite(props.confidence)
      ? props.confidence
      : null;

  const primaryCategory =
    props.taxonomy?.primary ||
    props.categories?.primary ||
    props.basic_category ||
    null;
  const category =
    props.basic_category ||
    props.taxonomy?.primary ||
    props.categories?.primary ||
    primaryCategory ||
    'restaurant';

  const addr = props.addresses?.[0];
  const address = addr?.freeform?.trim() || null;
  const city = addr?.locality?.trim() || null;
  const region = addr?.region?.trim() || null;
  const postcode = addr?.postcode?.trim() || null;
  const country = addr?.country?.trim() || null;
  const propsRecord = props as Record<string, unknown>;
  const brand = extractBrandName(props);
  const wikidata = props.brand?.wikidata?.trim() || null;
  const sources = Array.isArray(props.sources) && props.sources.length > 0
    ? props.sources.map(s => ({
        property: s.property,
        dataset: s.dataset,
        record_id: s.record_id,
      }))
    : null;

  const website_url = extractWebsiteUrl(props);
  const phone = extractPhone(props);

  const verdict = evaluatePlaceQuality({
    name,
    category: primaryCategory,
    categoryLabels: primaryCategory ? [primaryCategory] : [],
    website_url,
    phone,
    address,
    operating_status: status.operating_status,
    businessStatus: status.businessStatus,
    confidence,
    sources,
  });
  if (!verdict.ok) {
    return { kind: 'reject', gers_id: feature.id, reason: verdict.reason };
  }

  const priceRaw = extractOsmField(propsRecord, ['price_range', 'price_rating', 'priceRange', 'priceRating']);
  const priceTier = parseOsmPriceRange(priceRaw) ?? lookupBrandPriceTier(brand ?? name);

  return {
    kind: 'place',
    place: {
      id: feature.id,
      name,
      category,
      website_url,
      phone,
      address,
      city,
      region,
      postcode,
      country,
      operating_status: status.operating_status,
      businessStatus: status.businessStatus,
      priceTier,
      regularOpeningHours: null,
      brand,
      wikidata,
      sources,
      attributes: extractAttributes(props),
      confidence,
      location: { latitude: lat, longitude: lng },
    },
  };
}

// ─── Overture API Fetch ───────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PIN_DISTANCE_MAX_METERS = OVERTURE_SEARCH_RADIUS_METERS * 1.5;

async function fetchOvertureNearby(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<{ places: NormalizedPlace[]; rejected: RejectedPlace[] }> {
  const url = new URL(OVERTURE_API_BASE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('radius', String(OVERTURE_SEARCH_RADIUS_METERS));
  url.searchParams.set('categories', FOOD_CATEGORIES);
  url.searchParams.set('limit', String(MAX_RESULTS_PER_CELL));
  url.searchParams.set('format', 'json');

  let lastRateLimitError: Error | null = null;

  for (let attempt = 0; attempt <= OVERTURE_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (isOvertureRateLimited(response.status)) {
        const errText = await response.text();
        lastRateLimitError = new Error(`Overture API rate limited: ${response.status}`);
        if (attempt < OVERTURE_MAX_RETRIES) {
          const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
          const delay = retryAfter ?? OVERTURE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[v2-fetch-restaurants] Overture ${response.status} at (${lat.toFixed(4)}, ${lng.toFixed(4)}), ` +
            `retry ${attempt + 1}/${OVERTURE_MAX_RETRIES} in ${delay}ms: ${errText.slice(0, 120)}`
          );
          await sleep(delay);
          continue;
        }
        console.error(
          `[v2-fetch-restaurants] Overture rate limit exhausted after ${OVERTURE_MAX_RETRIES} retries: ${errText.slice(0, 300)}`
        );
        throw lastRateLimitError;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[v2-fetch-restaurants] Overture API error ${response.status}: ${errText.slice(0, 300)}`);
        throw new Error(`Overture API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const raw = await response.json();
      const features = parseOvertureFeatures(raw);
      console.log(`[v2-fetch-restaurants] Overture returned ${features.length} raw features at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

      const places: NormalizedPlace[] = [];
      const rejected: RejectedPlace[] = [];
      for (const feature of features) {
        const outcome = normalizeOvertureFeature(feature);
        if (outcome.kind === 'place') places.push(outcome.place);
        else if (outcome.kind === 'reject') rejected.push({ gers_id: outcome.gers_id, reason: outcome.reason });
      }

      const seen = new Set<string>();
      const deduped = places.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const withinRadius: NormalizedPlace[] = [];
      for (const p of deduped) {
        const dist = haversineMeters(lat, lng, p.location.latitude, p.location.longitude);
        if (dist > PIN_DISTANCE_MAX_METERS) {
          rejected.push({ gers_id: p.id, reason: 'bad_location' });
        } else {
          withinRadius.push(p);
        }
      }

      if (features.length > 0 && withinRadius.length === 0 && rejected.length === 0) {
        throw new Error(
          `Overture returned ${features.length} features but none normalized at (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        );
      }

      return { places: withinRadius, rejected };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Overture API request timed out');
      }
      throw err;
    }
  }

  throw lastRateLimitError ?? new Error('Overture API rate limited');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || !secretsEqual(incomingSecret, expectedSecret)) {
    return jsonErrorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  try {
    const body = await req.json();
    const { cells } = body;

    if (!cells || !Array.isArray(cells) || cells.length === 0) {
      return jsonErrorResponse(400, 'INVALID_REQUEST', 'cells array is required');
    }

    const overtureApiKey = Deno.env.get('OVERTURE_MAPS_KEY');
    if (!overtureApiKey) throw new Error('OVERTURE_MAPS_KEY missing from edge function environment');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing');
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = Date.now();

    const cellIdsToFetch = cells.map((c: { cellId: string }) => c.cellId);
    const { data: existingRows, error: dbReadError } = await supabase
      .from('v2_restaurant_cell_cache')
      .select('id, restaurants, fetched_at')
      .in('id', cellIdsToFetch);

    if (dbReadError) {
      console.warn(`[v2-fetch-restaurants] Supabase cache read error: ${dbReadError.message}`);
    }

    const cachedMap = new Map<string, NormalizedPlace[]>();
    for (const row of (existingRows ?? [])) {
      const fetchedAt = new Date(row.fetched_at).getTime();
      if (now - fetchedAt < CACHE_TTL_MS && Array.isArray(row.restaurants) && row.restaurants.length > 0) {
        cachedMap.set(row.id, row.restaurants as NormalizedPlace[]);
      }
    }

    console.log(`[v2-fetch-restaurants] Supabase v2 cell cache: ${cachedMap.size} / ${cellIdsToFetch.length} cells cached`);

    const newlyFetchedRestaurants: { cellId: string; places: NormalizedPlace[] }[] = [];
    const failedCells: { cellId: string; reason: string }[] = [];

    const cacheRejectedAll: RejectedPlace[] = [];
    const cellMeta = new Map(
      (cells as Array<{ cellId: string; lat?: number; lng?: number }>).map((c) => [c.cellId, c]),
    );
    for (const [cellId, places] of cachedMap) {
      const { kept: qualityKept, rejected: cacheRejected } = filterEnrichAndRejectPlaces(places);
      cacheRejectedAll.push(...cacheRejected);
      const meta = cellMeta.get(cellId);
      const atpRows =
        meta?.lat != null && meta?.lng != null
          ? await loadAtpHoursNearby(supabase, meta.lat, meta.lng)
          : [];
      const kept = attachOpeningHours(qualityKept, atpRows);
      newlyFetchedRestaurants.push({ cellId, places: kept });
    }
    await upsertRejectedPlaces(supabase, cacheRejectedAll);

    const missingCells = cells.filter((c: { cellId: string }) => !cachedMap.has(c.cellId));

    await Promise.all(
      missingCells.map(async (cell: { cellId: string; lat?: number; lng?: number }) => {
        try {
          if (cell.lat == null || cell.lng == null) {
            throw new Error(`Cell ${cell.cellId} is missing lat/lng`);
          }

          const { places, rejected: normalizeRejected } = await fetchOvertureNearby(
            cell.lat,
            cell.lng,
            overtureApiKey,
          );

          const alreadyRejected = await loadRejectedIds(
            supabase,
            places.map((p) => p.id),
          );
          const freshPlaces = places.filter((p) => !alreadyRejected.has(p.id));

          const { kept: qualityKept, rejected: qualityRejected } =
            filterEnrichAndRejectPlaces(freshPlaces);

          const atpRows = await loadAtpHoursNearby(supabase, cell.lat, cell.lng);
          const kept = attachOpeningHours(qualityKept, atpRows);
          const allRejected = [...normalizeRejected, ...qualityRejected];
          await upsertRejectedPlaces(supabase, allRejected);

          newlyFetchedRestaurants.push({ cellId: cell.cellId, places: kept });

          const inputCount = places.length + normalizeRejected.length;
          const thrownOut = normalizeRejected.length + (places.length - freshPlaces.length) + qualityRejected.length;
          const rejectPct = pct(thrownOut, inputCount);

          if (kept.length > 0) {
            const { error: upsertError } = await supabase
              .from('v2_restaurant_cell_cache')
              .upsert(
                { id: cell.cellId, restaurants: kept, fetched_at: new Date().toISOString() },
                { onConflict: 'id' }
              );
            if (upsertError) {
              console.error(`[v2-fetch-restaurants] Supabase upsert error for cell ${cell.cellId}: ${upsertError.message}`);
              await logIssue(supabase, {
                source: 'edge:v2-fetch-restaurants',
                kind: 'cell_cache_upsert_failed',
                message: `Failed to upsert cell cache for ${cell.cellId}`,
                severity: 'error',
                cellId: cell.cellId,
                detail: { error: upsertError.message, kept: kept.length },
              });
            } else {
              console.log(
                `[v2-fetch-restaurants] Supabase upsert OK: cell ${cell.cellId} → ${kept.length} places ` +
                `(${allRejected.length} rejected tombstones)`
              );
            }
            if (rejectPct >= 80) {
              await logIssue(supabase, {
                source: 'edge:v2-fetch-restaurants',
                kind: 'high_reject_rate',
                message: `High reject rate for cell ${cell.cellId}: ${rejectPct}% thrown out`,
                severity: 'warn',
                cellId: cell.cellId,
                detail: {
                  inputCount,
                  kept: kept.length,
                  thrownOut,
                  rejectPct,
                  normalizeRejected: normalizeRejected.length,
                  qualityRejected: qualityRejected.length,
                  alreadyTombstoned: places.length - freshPlaces.length,
                },
              });
            }
          } else {
            console.log(
              `[v2-fetch-restaurants] No usable places for cell ${cell.cellId} — ` +
              `skipping cell upsert (${allRejected.length} rejected)`
            );
            await logIssue(supabase, {
              source: 'edge:v2-fetch-restaurants',
              kind: 'overture_cell_empty',
              message: `Overture cell ${cell.cellId} found no usable restaurants (${rejectPct}% thrown out)`,
              severity: 'error',
              cellId: cell.cellId,
              detail: {
                lat: cell.lat,
                lng: cell.lng,
                inputCount,
                kept: 0,
                thrownOut,
                rejectPct,
                normalizeRejected: normalizeRejected.length,
                qualityRejected: qualityRejected.length,
                alreadyTombstoned: places.length - freshPlaces.length,
                qualityReasons: qualityRejected.reduce((acc: Record<string, number>, r) => {
                  acc[r.reason] = (acc[r.reason] ?? 0) + 1;
                  return acc;
                }, {}),
              },
            });
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[v2-fetch-restaurants] Failed cell ${cell.cellId}: ${reason}`);
          failedCells.push({ cellId: cell.cellId, reason });
          await logIssue(supabase, {
            source: 'edge:v2-fetch-restaurants',
            kind: 'overture_cell_failed',
            message: `Overture cell ${cell.cellId} failed: ${reason}`,
            severity: 'error',
            cellId: cell.cellId,
            detail: { reason, lat: cell.lat, lng: cell.lng },
          });
        }
      })
    );

    if (newlyFetchedRestaurants.length === 0 && failedCells.length > 0) {
      await logIssue(supabase, {
        source: 'edge:v2-fetch-restaurants',
        kind: 'all_cells_failed',
        message: 'All overture cells failed to fetch',
        severity: 'error',
        detail: { failedCells },
        cellId: failedCells[0]?.cellId ?? null,
      });
      return jsonErrorResponse(500, 'ALL_CELLS_FAILED', 'All cells failed', { failedCells });
    }

    const totalPlacesReturned = newlyFetchedRestaurants.reduce(
      (sum, r) => sum + (r.places?.length ?? 0),
      0
    );

    console.log(
      `[v2-fetch-restaurants] Complete: res 7, ${cells.length} cells → ${totalPlacesReturned} total places returned`
    );

    return new Response(
      JSON.stringify({ newlyFetchedRestaurants, failedCells, totalPlacesReturned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[v2-fetch-restaurants] Unhandled error:', error);
    return jsonErrorResponse(500, 'INTERNAL_ERROR', message);
  }
});
