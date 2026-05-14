import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-secret",
};

const DIETARY_VETO_MAP: Record<string, string[]> = {
  vegan: ["steakhouse", "burger_restaurant", "seafood_restaurant", "barbecue_restaurant"],
  vegetarian: ["steakhouse", "burger_restaurant", "barbecue_restaurant"],
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
  pizza_restaurant: 2,
  fast_food_restaurant: 1,
};

const MOOD_CUISINE_MAP: Record<string, string[]> = {
  warm: ["japanese_restaurant", "ramen_restaurant", "korean_restaurant"],
  fresh: ["sushi_restaurant", "salad_shop", "mediterranean_restaurant", "vietnamese_restaurant"],
  comfort: ["american_restaurant", "pizza_restaurant", "burger_restaurant", "italian_restaurant"],
  bold: ["mexican_restaurant", "indian_restaurant", "thai_restaurant", "ethiopian_restaurant"],
  surprise: [],
};

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

  const expectedSecret = Deno.env.get("APP_SECRET");
  const incomingSecret = req.headers.get("x-app-secret");
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({
        error: "server_misconfigured",
        detail:
          "APP_SECRET is not set for Edge Functions. In Supabase: Project Settings → Edge Functions → add secret APP_SECRET to match EXPO_PUBLIC_APP_SECRET in the app.",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (incomingSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        detail:
          "x-app-secret header did not match server APP_SECRET. Check EXPO_PUBLIC_APP_SECRET in the app .env and APP_SECRET in Supabase.",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
    .from("restaurant_cache")
    .select("restaurants")
    .in("id", cellIds);

  const allRestaurants = (cacheRows ?? []).flatMap((row: { restaurants?: unknown }) =>
    Array.isArray(row.restaurants) ? row.restaurants : []
  );

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

  const eligible = restaurants.filter((r: { primaryType?: string }) => {
    const pt = r.primaryType ?? "";
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
    const rating = typeof r.rating === "number" ? r.rating : null;
    const ratingScore = rating != null ? ((rating - 1) / 4) * 100 : 50;
    score += ratingScore * weights.rating;

    const primaryType = String(r.primaryType ?? "");
    const healthScore = (HEALTH_SCORES[primaryType] ?? 3) / 5 * 100;
    score += healthScore * 0.2;

    if (boostedCuisines.has(primaryType)) score += 20;

    if (dominantEnergy === "low_key") {
      if (["cafe", "salad_shop"].includes(primaryType)) score += 15;
      if (["bar"].includes(primaryType)) score -= 20;
    }
    if (dominantEnergy === "lets_go") {
      if (r.goodForGroups) score += 15;
      if (r.liveMusic) score += 10;
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
    const pt = String(r.primaryType ?? "");
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

  const { error: upErr } = await supabase
    .from("group_sessions")
    .update({ status: "voting", picks: top5 })
    .eq("id", sessionId);

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ picks: top5 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
