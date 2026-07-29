import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { assertAppSecret } from "../_shared/security.ts";
import { logIssue } from "../_shared/issueLog.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-secret",
};

const MAX_MESSAGE = 2000;
const MAX_KIND = 120;
const MAX_SOURCE = 120;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secretErr = assertAppSecret(req, corsHeaders);
  if (secretErr) return secretErr;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const kind = typeof body?.kind === "string" ? body.kind.trim().slice(0, MAX_KIND) : "";
    const message =
      typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
    const sourceRaw =
      typeof body?.source === "string" ? body.source.trim().slice(0, MAX_SOURCE) : "client";
    const source = sourceRaw.startsWith("client") ? sourceRaw : `client:${sourceRaw}`;

    if (!kind || !message) {
      return new Response(JSON.stringify({ error: "kind and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const severity =
      body?.severity === "info" || body?.severity === "warn" || body?.severity === "error"
        ? body.severity
        : "error";

    const detail =
      body?.detail != null && typeof body.detail === "object" && !Array.isArray(body.detail)
        ? (body.detail as Record<string, unknown>)
        : {};

    const cellId = typeof body?.cellId === "string" ? body.cellId : null;
    const userId = typeof body?.userId === "string" ? body.userId : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    await logIssue(supabase, {
      source,
      kind,
      message,
      severity,
      detail,
      cellId,
      userId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[log-app-issue]", msg);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
