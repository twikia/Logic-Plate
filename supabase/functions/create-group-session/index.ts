import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-secret",
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

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

  let body: { cellIds?: string[]; hostUserId?: string | null; mode?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cellIds = Array.isArray(body.cellIds) ? body.cellIds.filter((x) => typeof x === "string") : [];
  if (cellIds.length === 0) {
    return new Response(JSON.stringify({ error: "cellIds required" }), {
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

  let code = generateCode();
  for (let i = 0; i < 8; i++) {
    const { data } = await supabase
      .from("group_sessions")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) break;
    code = generateCode();
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const hostUserId =
    typeof body.hostUserId === "string" && body.hostUserId.length > 0 ? body.hostUserId : null;
  const mode = typeof body.mode === "string" && body.mode.length > 0 ? body.mode : null;

  const { data, error } = await supabase
    .from("group_sessions")
    .insert({
      code,
      host_user_id: hostUserId,
      mode,
      cell_ids: cellIds,
      status: "collecting",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ session: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
