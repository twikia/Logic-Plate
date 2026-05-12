import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

const responseSchema = {
  type: 'OBJECT',
  properties: {
    placeId: { type: 'STRING' },
    rationale: { type: 'STRING' },
  },
  required: ['placeId'],
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('APP_SECRET');
  const incomingSecret = req.headers.get('x-app-secret');
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { userText, places } = await req.json();
    if (!userText || typeof userText !== 'string') {
      return new Response(JSON.stringify({ error: 'userText is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!places || !Array.isArray(places) || places.length === 0) {
      return new Response(JSON.stringify({ error: 'places array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is missing from edge function environment');
    }

    const allowedIds = new Set<string>(places.map((p: { id?: string }) => String(p?.id || '')).filter(Boolean));
    const lines = places.map((p: any, i: number) => {
      const name = p?.displayName?.text || p?.name || '';
      const cat = p?.primaryTypeDisplayName?.text || p?.primaryType || '';
      const rating = p?.rating ?? '';
      return `${i + 1}. id=${p?.id} name=${name} category=${cat} rating=${rating}`;
    });

    const prompt = `You help pick one restaurant from a fixed list. User request: "${userText.trim()}".

Candidates (choose exactly one id from this list only):
${lines.join('\n')}

Return JSON with key "placeId" equal to the chosen listing id, and optional "rationale" under 200 chars. If nothing fits, pick the closest reasonable option from the list anyway.`;

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      return new Response(JSON.stringify({ error: t || 'Gemini request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const modelData = await response.json();
    const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Empty model response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: { placeId?: string; rationale?: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON from model' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const placeId = String(parsed?.placeId || '').trim();
    if (!placeId || !allowedIds.has(placeId)) {
      return new Response(JSON.stringify({ error: 'Model returned invalid placeId' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ placeId, rationale: parsed.rationale ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
