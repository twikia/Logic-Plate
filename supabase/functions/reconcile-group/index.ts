import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { normalizePlaces, healDatabaseRows } from "../_shared/normalizePlaces.ts";
import { assertAppSecret } from "../_shared/security.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-secret",
};

function resolveServiceRoleKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const d = parsed.default;
    if (typeof d === "string" && d.trim()) return d.trim();
    for (const v of Object.values(parsed)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    return "";
  }
  return "";
}

const DIETARY_VETO_MAP: Record<string, string[]> = {
  vegan: ["steak_house", "steakhouse", "burger_restaurant", "hamburger_restaurant", "seafood_restaurant", "barbecue_restaurant"],
  vegetarian: ["steak_house", "steakhouse", "burger_restaurant", "hamburger_restaurant", "barbecue_restaurant"],
  halal: ["barbecue_restaurant"],
  gluten_free: ["pizza_restaurant", "ramen_restaurant"],
};

const HEALTH_SCORES: Record<string, number> = {
  japanese_restaurant: 5,
  sushi_restaurant: 5,
  vietnamese_restaurant: 5,
  mediterranean_restaurant: 4,
  greek_restaurant: 4,
  indian_restaurant: 4,
  mexican_restaurant: 3,
  italian_restaurant: 3,
  chinese_restaurant: 3,
  american_restaurant: 2,
  burger_restaurant: 1,
  hamburger_restaurant: 1,
  pizza_restaurant: 2,
  fast_food_restaurant: 1,
};

const MOOD_CUISINE_MAP: Record<string, string[]> = {
  warm: ["japanese_restaurant", "ramen_restaurant", "korean_restaurant"],
  fresh: ["sushi_restaurant", "salad_shop", "mediterranean_restaurant", "vietnamese_restaurant"],
  comfort: ["american_restaurant", "pizza_restaurant", "burger_restaurant", "hamburger_restaurant", "italian_restaurant"],
  bold: ["mexican_restaurant", "indian_restaurant", "thai_restaurant", "ethiopian_restaurant"],
  surprise: [],
};

function placeCategory(r: { category?: string; primaryType?: string; cuisineKey?: string }): string {
  return String(r.category ?? r.primaryType ?? r.cuisineKey ?? "");
}

function resolvePriceTier(r: Record<string, unknown>): number | null {
  const direct = r.priceTier;
  if (typeof direct === "number" && direct >= 1 && direct <= 4) return direct;
  const ai = r.aiOverview as { priceTier?: number } | undefined;
  if (typeof ai?.priceTier === "number" && ai.priceTier >= 1 && ai.priceTier <= 4) {
    return ai.priceTier;
  }
  return null;
}

function toClientPick(
  r: Record<string, unknown>,
  ai?: { summaryGoodBad: string; healthScore: number; priceTier?: number | null },
): Record<string, unknown> {
  const name = String(r.name ?? (r.displayName as { text?: string } | undefined)?.text ?? "");
  const address = String(r.address ?? r.formattedAddress ?? "");
  const website = String(r.website_url ?? r.websiteUri ?? "");
  const category = placeCategory(r as { category?: string; primaryType?: string; cuisineKey?: string });
  const priceTier = resolvePriceTier(r) ?? (typeof ai?.priceTier === "number" ? ai.priceTier : null);
  const base: Record<string, unknown> = {
    ...r,
    name,
    displayName: { text: name },
    address,
    formattedAddress: address,
    website_url: website || undefined,
    websiteUri: website || undefined,
    category,
    primaryType: category || r.primaryType,
  };
  if (priceTier != null) base.priceTier = priceTier;
  if (!ai) return base;
  return {
    ...base,
    aiOverview: {
      summaryGoodBad: ai.summaryGoodBad,
      healthScore: ai.healthScore,
      ...(typeof ai.priceTier === "number" ? { priceTier: ai.priceTier } : {}),
    },
    healthScore: ai.healthScore,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const secretErr = assertAppSecret(req, corsHeaders);
  if (secretErr) return secretErr;

  let body: { sessionId?: string; localRestaurantCache?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const localRestaurantCache = Array.isArray(body.localRestaurantCache)
    ? body.localRestaurantCache
    : [];
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = resolveServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: session, error: sessionErr } = await supabase
    .from("group_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const exp = new Date(session.expires_at).getTime();
  if (exp <= Date.now()) {
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: responses, error: respErr } = await supabase
    .from("group_responses")
    .select("*")
    .eq("session_id", sessionId);

  if (respErr || !responses?.length) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cellIds: string[] = Array.isArray(session.cell_ids) ? session.cell_ids : [];
  if (cellIds.length === 0) {
    return new Response(JSON.stringify({ error: "No cells for session" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: cacheRows } = await supabase
    .from("v2_restaurant_cell_cache")
    .select("id, restaurants, fetched_at")
    .in("id", cellIds);

  const healedMap = await healDatabaseRows(supabase, cacheRows || []);
  const supabaseMap = new Map<string, unknown[]>();
  for (const [id, places] of healedMap.entries()) {
    if (places.length > 0) {
      supabaseMap.set(id, places);
    }
  }

  const localMap = new Map<string, unknown[]>();
  for (const item of localRestaurantCache as { cellId?: unknown; restaurants?: unknown }[]) {
    if (typeof item.cellId === "string" && item.restaurants) {
      const { places } = normalizePlaces(item.restaurants);
      if (places.length > 0) {
        localMap.set(item.cellId, places);
      }
    }
  }

  const allRestaurants = cellIds.flatMap((cellId: string) => {
    const fromSupabase = supabaseMap.get(cellId);
    if (fromSupabase && fromSupabase.length > 0) return fromSupabase;
    return localMap.get(cellId) ?? [];
  });

  const seen = new Set<string>();
  const restaurants = allRestaurants.filter((r: { id?: string }) => {
    const id = r?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const allVetoes = new Set(
    responses.flatMap((r: { dietary_vetoes?: string[] }) =>
      Array.isArray(r.dietary_vetoes) ? r.dietary_vetoes : []
    )
  );

  const eligible = restaurants.filter((r: { category?: string; primaryType?: string; cuisineKey?: string }) => {
    const pt = placeCategory(r);
    for (const veto of allVetoes) {
      const blocked = DIETARY_VETO_MAP[veto] ?? [];
      if (blocked.includes(pt)) return false;
    }
    return true;
  });

  const weightTally = { affordable: 0, close: 0, quality: 0, new: 0 };
  responses.forEach((r: { priority?: string }) => {
    if (r.priority && r.priority in weightTally) {
      weightTally[r.priority as keyof typeof weightTally]++;
    }
  });
  const total = responses.length;
  const weights = {
    price: weightTally.affordable / total,
    distance: weightTally.close / total,
    rating: weightTally.quality / total,
    novelty: weightTally.new / total,
  };

  const energyTally = { low_key: 0, pretty_good: 0, lets_go: 0 };
  responses.forEach((r: { energy_level?: string }) => {
    if (r.energy_level && r.energy_level in energyTally) {
      energyTally[r.energy_level as keyof typeof energyTally]++;
    }
  });
  const dominantEnergy = Object.entries(energyTally).sort((a, b) => b[1] - a[1])[0][0];

  const moodVotes: Record<string, number> = {};
  responses.forEach((r: { food_mood?: string }) => {
    const m = r.food_mood;
    if (m) moodVotes[m] = (moodVotes[m] ?? 0) + 1;
  });
  const boostedCuisines = new Set<string>();
  Object.entries(moodVotes).forEach(([mood, count]) => {
    if (count >= responses.length / 2) {
      (MOOD_CUISINE_MAP[mood] ?? []).forEach((c) => boostedCuisines.add(c));
    }
  });

  const scored = eligible.map((r: Record<string, unknown>) => {
    let score = 0;
    const ai = r.aiOverview as {
      healthScore?: number;
      tasteScore?: number;
      valueForMoneyScore?: number;
      groupSizeSweetSpot?: number;
      noiseLevelEstimate?: number;
    } | undefined;
    const aiHealth = typeof ai?.healthScore === "number" ? ai.healthScore : null;
    const rating = typeof r.rating === "number" ? r.rating : null;
    const taste = typeof ai?.tasteScore === "number" ? ai.tasteScore : null;
    const qualityScore = rating != null
      ? ((rating - 1) / 4) * 100
      : taste != null
        ? (taste / 5) * 100
        : 50;
    score += qualityScore * weights.rating;

    const priceTier = resolvePriceTier(r);
    if (priceTier != null) {
      const priceScore = ((5 - priceTier) / 4) * 100;
      score += priceScore * weights.price;
    }

    const primaryType = placeCategory(r as { category?: string; primaryType?: string; cuisineKey?: string });
    const healthScore = aiHealth != null
      ? (aiHealth / 10) * 100
      : (HEALTH_SCORES[primaryType] ?? 3) / 5 * 100;
    score += healthScore * 0.2;

    if (boostedCuisines.has(primaryType)) score += 20;

    if (dominantEnergy === "low_key") {
      if (["cafe", "salad_shop"].includes(primaryType)) score += 15;
      if (["bar"].includes(primaryType)) score -= 20;
      if (typeof ai?.noiseLevelEstimate === "number" && ai.noiseLevelEstimate <= 2) score += 10;
    }
    if (dominantEnergy === "lets_go") {
      if (typeof ai?.groupSizeSweetSpot === "number" && ai.groupSizeSweetSpot >= 4) score += 15;
      if (typeof ai?.noiseLevelEstimate === "number" && ai.noiseLevelEstimate >= 3) score += 10;
    }

    return { ...r, groupScore: Math.min(100, Math.max(0, Math.round(score))) };
  });

  const sortedAll = scored.sort(
    (a: { groupScore?: number }, b: { groupScore?: number }) =>
      (b.groupScore ?? 0) - (a.groupScore ?? 0)
  );
  const cuisineCounts: Record<string, number> = {};
  const top5: Record<string, unknown>[] = [];
  const overflow: Record<string, unknown>[] = [];

  for (const r of sortedAll) {
    const pt = placeCategory(r as { category?: string; primaryType?: string; cuisineKey?: string });
    const count = cuisineCounts[pt] ?? 0;
    if (count < 2 && top5.length < 5) {
      top5.push(r);
      cuisineCounts[pt] = count + 1;
    } else {
      overflow.push(r);
    }
  }
  while (top5.length < 5 && overflow.length > 0) {
    const next = overflow.shift();
    if (next) top5.push(next);
  }

  if (top5.length === 0) {
    return new Response(
      JSON.stringify({
        error: "no_restaurants_for_picks",
        detail:
          "No cached restaurants matched this session area and filters. Open Platebound on a phone, load the map near the group so the cache fills, then start a new session.",
      }),
      {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const top5Ids = top5
    .map((r) => String((r as { id?: unknown }).id ?? ""))
    .filter(Boolean);

  const { data: aiRows } = await supabase
    .from("v2_ai_overview_cache")
    .select("gers_id, summary_good_bad, health_score, price_tier, taste_score")
    .in("gers_id", top5Ids);

  const aiMap = new Map<string, {
    summaryGoodBad: string;
    healthScore: number;
    priceTier?: number | null;
    tasteScore?: number | null;
  }>();
  for (const row of (aiRows ?? []) as {
    gers_id: string;
    summary_good_bad: string | null;
    health_score: number | null;
    price_tier: number | null;
    taste_score: number | null;
  }[]) {
    if (row.summary_good_bad && row.health_score != null) {
      aiMap.set(row.gers_id, {
        summaryGoodBad: row.summary_good_bad,
        healthScore: row.health_score,
        priceTier: row.price_tier,
        tasteScore: row.taste_score,
      });
    }
  }

  const top5WithAi = top5.map((r: Record<string, unknown>) => {
    const ai = aiMap.get(String(r.id ?? ""));
    return toClientPick(r, ai);
  });

  const { error: upErr } = await supabase
    .from("group_sessions")
    .update({ status: "voting", picks: top5WithAi })
    .eq("id", sessionId);

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ picks: top5WithAi }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
