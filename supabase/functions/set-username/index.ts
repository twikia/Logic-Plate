import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USERNAME_RE = /^[a-zA-Z0-9_]{2,30}$/;

const PROFANITY = new Set([
  "arse", "ass", "bastard", "bitch", "bollocks", "bullshit", "cock", "crap",
  "cunt", "damn", "dick", "dyke", "fag", "faggot", "fuck", "fucking", "nazi",
  "nigger", "nigga", "penis", "piss", "porn", "pussy", "rape", "retard",
  "shit", "slut", "spic", "twat", "wank", "whore",
]);

function normalizeForProfanity(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function containsProfanity(raw: string): boolean {
  const compact = normalizeForProfanity(raw);
  for (const word of PROFANITY) {
    if (compact.includes(word)) return true;
  }
  return false;
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!USERNAME_RE.test(username)) {
    return new Response(JSON.stringify({ error: "invalid_username" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (containsProfanity(username)) {
    return new Response(JSON.stringify({ error: "profanity" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const { error: upErr } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, username }, { onConflict: "id" });

  if (upErr) {
    if (upErr.code === "23505") {
      return new Response(JSON.stringify({ error: "taken" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "update_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, username }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
