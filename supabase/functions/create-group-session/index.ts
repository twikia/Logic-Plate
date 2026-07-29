import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { assertAppSecret } from "../_shared/security.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-secret",
};

const MAX_CELL_IDS = 128;

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
  try {
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
    if (secretErr) {
      if (secretErr.status === 401) {
        console.error("[create-group-session] x-app-secret mismatch");
      } else {
        console.error("[create-group-session] APP_SECRET env var is not set");
      }
      return secretErr;
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

    const cellIds = Array.isArray(body.cellIds)
      ? body.cellIds.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 32)
      : [];
    if (cellIds.length === 0) {
      return new Response(JSON.stringify({ error: "cellIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cellIds.length > MAX_CELL_IDS) {
      return new Response(JSON.stringify({ error: "too_many_cellIds", max: MAX_CELL_IDS }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = resolveServiceRoleKey();
    if (!supabaseUrl || !serviceKey) {
      console.error(
        `[create-group-session] server_misconfigured: SUPABASE_URL=${!!supabaseUrl} serviceKey=${!!serviceKey}`,
      );
      return new Response(
        JSON.stringify({
          error: "server_misconfigured",
          detail: !serviceKey
            ? "SUPABASE_SERVICE_ROLE_KEY is not available. Set it under Project Settings → Edge Functions → Secrets."
            : "SUPABASE_URL is not available.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      typeof body.hostUserId === "string" && body.hostUserId.length > 0 && body.hostUserId.length <= 128
        ? body.hostUserId
        : null;
    const mode = typeof body.mode === "string" && body.mode.length > 0 && body.mode.length <= 64
      ? body.mode
      : null;

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
      console.error("[create-group-session] DB insert error:", error.message, error.code);
      return new Response(
        JSON.stringify({
          error: error.message,
          detail: error.code === "42P01"
            ? "The group_sessions table does not exist. Apply the group_voting migration to your Supabase project."
            : error.details ?? undefined,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ session: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-group-session] unhandled exception:", message);
    return new Response(
      JSON.stringify({ error: "internal_error", detail: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
