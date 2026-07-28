import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import {
    isDeadTransportError,
    mapPool,
    pingWebsite,
    scrapeWebsite,
} from "../_shared/websiteScrape.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-secret",
};

// Keep batches small: unbounded parallel HTML fetches were OOM'ing (~289MB heap).
const MAX_PLACES_PER_REQUEST = 12;
const PING_CONCURRENCY = 12;
const SCRAPE_CONCURRENCY = 4;
const SCRAPE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type InputPlace = {
  gers_id: string;
  website_url?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("APP_SECRET");
  const incomingSecret = req.headers.get("x-app-secret");
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { places } = await req.json();
    if (!places || !Array.isArray(places)) {
      return new Response(JSON.stringify({ error: "places array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const unique = new Map<string, InputPlace>();
    for (const p of places as InputPlace[]) {
      if (!p?.gers_id || !p?.website_url) continue;
      if (!unique.has(p.gers_id)) unique.set(p.gers_id, p);
      if (unique.size >= MAX_PLACES_PER_REQUEST) break;
    }
    const candidates = [...unique.values()];
    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ scraped: 0, skipped: 0, scrapedPlaceIds: [], excludedPlaceIds: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gersIds = candidates.map((p) => p.gers_id);
    const { data: existing } = await supabase
      .from("v2_website_scrape_cache")
      .select("gers_id, scraped_at, is_dead")
      .in("gers_id", gersIds);

    const freshOk = new Set<string>();
    const freshDead = new Set<string>();
    const now = Date.now();
    for (const row of existing ?? []) {
      const age = now - new Date(row.scraped_at).getTime();
      if (!Number.isFinite(age) || age >= SCRAPE_TTL_MS) continue;
      if (row.is_dead) freshDead.add(row.gers_id);
      else freshOk.add(row.gers_id);
    }

    const toFetch = candidates.filter((p) => !freshOk.has(p.gers_id) && !freshDead.has(p.gers_id));
    const excludedPlaceIds: string[] = [...freshDead];
    const scrapedPlaceIds: string[] = [...freshOk];

    const pingResults = await mapPool(toFetch, PING_CONCURRENCY, async (place) => {
      const result = await pingWebsite(place.website_url!);
      return { place, alive: result !== "dead" };
    });

    const alive: InputPlace[] = [];
    for (const { place, alive: ok } of pingResults) {
      if (!ok) excludedPlaceIds.push(place.gers_id);
      else alive.push(place);
    }

    const upserts: Record<string, unknown>[] = [];
    await mapPool(alive, SCRAPE_CONCURRENCY, async (place) => {
      try {
        const scraped = await scrapeWebsite(place.website_url!);
        if (scraped.deadWebsite) {
          excludedPlaceIds.push(place.gers_id);
          upserts.push({
            gers_id: place.gers_id,
            website_url: place.website_url,
            menu_text: null,
            hours_text: null,
            json_ld_weekday_descriptions: null,
            is_dead: true,
            scraped_at: new Date().toISOString(),
          });
          return;
        }
        // Soft-fail (timeout / empty / no usable food text): do not cache as dead.
        if (!scraped.menuText?.trim() && !scraped.hoursText?.trim()) {
          return;
        }
        scrapedPlaceIds.push(place.gers_id);
        upserts.push({
          gers_id: place.gers_id,
          website_url: place.website_url,
          menu_text: scraped.menuText || null,
          hours_text: scraped.hoursText || null,
          json_ld_weekday_descriptions:
            scraped.jsonLdWeekdayDescriptions.length === 7
              ? scraped.jsonLdWeekdayDescriptions
              : null,
          is_dead: false,
          scraped_at: new Date().toISOString(),
        });
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        if (isDeadTransportError(msg) || err instanceof TypeError) {
          excludedPlaceIds.push(place.gers_id);
          upserts.push({
            gers_id: place.gers_id,
            website_url: place.website_url,
            menu_text: null,
            hours_text: null,
            json_ld_weekday_descriptions: null,
            is_dead: true,
            scraped_at: new Date().toISOString(),
          });
        }
      }
    });

    for (const gers_id of excludedPlaceIds) {
      if (!upserts.some((u) => u.gers_id === gers_id)) {
        const place = toFetch.find((p) => p.gers_id === gers_id) ??
          candidates.find((p) => p.gers_id === gers_id);
        upserts.push({
          gers_id,
          website_url: place?.website_url ?? null,
          menu_text: null,
          hours_text: null,
          json_ld_weekday_descriptions: null,
          is_dead: true,
          scraped_at: new Date().toISOString(),
        });
      }
    }

    if (upserts.length > 0) {
      await supabase.from("v2_website_scrape_cache").upsert(upserts, { onConflict: "gers_id" });
    }
    const uniqueExcluded = [...new Set(excludedPlaceIds)];
    if (uniqueExcluded.length > 0) {
      await supabase.from("v2_rejected_places").upsert(
        uniqueExcluded.map((gers_id) => ({ gers_id, reason: "dead_website" })),
        { onConflict: "gers_id", ignoreDuplicates: true },
      );
    }

    const uniqueScraped = [...new Set(scrapedPlaceIds)].filter((id) => !uniqueExcluded.includes(id));

    console.log(
      `[v2-scrape-websites] requested=${candidates.length} freshSkip=${freshOk.size + freshDead.size} ` +
        `scraped=${uniqueScraped.length} dead=${uniqueExcluded.length}`,
    );

    return new Response(
      JSON.stringify({
        scraped: uniqueScraped.length,
        skipped: freshOk.size + freshDead.size,
        scrapedPlaceIds: uniqueScraped,
        excludedPlaceIds: uniqueExcluded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[v2-scrape-websites] Unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
