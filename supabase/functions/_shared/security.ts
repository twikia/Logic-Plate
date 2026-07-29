const textEncoder = new TextEncoder();

/** Constant-time string compare to reduce timing leaks on APP_SECRET checks. */
export function secretsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  const len = Math.max(aa.length, bb.length);
  let out = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    out |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return out === 0;
}

export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
  detail?: string,
): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", ...(detail ? { detail } : {}) }),
    {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

export function misconfiguredSecretResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "server_misconfigured",
      detail:
        "APP_SECRET is not set for Edge Functions. In Supabase: Project Settings → Edge Functions → add secret APP_SECRET.",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** Returns an error Response if APP_SECRET is missing/mismatch; otherwise null. */
export function assertAppSecret(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const expectedSecret = Deno.env.get("APP_SECRET");
  const incomingSecret = req.headers.get("x-app-secret");
  if (!expectedSecret) return misconfiguredSecretResponse(corsHeaders);
  if (!secretsEqual(incomingSecret, expectedSecret)) {
    return unauthorizedResponse(
      corsHeaders,
      "x-app-secret header did not match server APP_SECRET.",
    );
  }
  return null;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (!token) return null;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (anon && secretsEqual(token, anon)) return null;
  return token;
}
