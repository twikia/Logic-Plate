import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const FETCH_USER_AGENT = 'Platebound/1.0 (menu-fetcher; contact: support@platebound.app)';

const SYSTEM_INSTRUCTION = `You are an expert culinary AI extracting signature menu items and exact prices from restaurant website text.
Return JSON ONLY at the root: an object with a single key "items" whose value is an array of up to 4 objects.
Each object must represent a signature dish or top menu item explicitly found in the text.
For each dish, you MUST include:
1) "name": the exact name of the dish as printed on the menu.
2) "price": the exact price printed on the menu (e.g. "$18.00" or "$22"). If no exact price is printed for that item in the text, omit price or return "". DO NOT guess or estimate prices.
3) "overview": a concise 1-sentence overview describing the flavor profile and ingredients.
CRITICAL RULE: If no actual food menu items or dishes can be found explicitly in the text (e.g. it is just parking info or landing page), return an empty array [] for "items". DO NOT invent, hallucinate, or estimate dishes.`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          price: { type: 'STRING', description: 'The exact price printed on the menu, e.g. $16.00. Empty if unknown.' },
          overview: { type: 'STRING', description: 'A concise 1-sentence description or overview of the dish.' },
        },
        required: ['name', 'price', 'overview'],
      },
    },
  },
  required: ['items'],
} as const;

function extractTextFromHtml(html: string): string {
  const noScript = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  const noStyle = noScript.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  const noNav = noStyle.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');
  const noFooter = noNav.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  const text = noFooter.replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, 100000);
}

async function fetchWebsiteText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    const html = await res.text();
    return extractTextFromHtml(html);
  } catch {
    return '';
  }
}

async function scrapeMenu(websiteUri: string): Promise<string> {
  const cleanBase = websiteUri.endsWith('/') ? websiteUri.slice(0, -1) : websiteUri;
  const urlsToFetch = [
    websiteUri,
    `${cleanBase}/menu`,
    `${cleanBase}/menus`,
    `${cleanBase}/food`,
    `${cleanBase}/dinner`,
  ];
  const texts = await Promise.all(urlsToFetch.map(u => fetchWebsiteText(u)));
  const combined = Array.from(new Set(texts.filter(Boolean))).join(' ');
  return combined.slice(0, 100000);
}

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
    const { placeId, websiteUri, placeName, cuisine } = await req.json();
    if (!placeId) {
      return new Response(JSON.stringify({ error: 'placeId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Check Cache first
    const { data: cached } = await supabase
      .from('restaurant_menu_cache')
      .select('top_items')
      .eq('place_id', placeId)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({ items: cached.top_items }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!websiteUri) {
      await supabase.from('restaurant_menu_cache').upsert({ place_id: placeId, top_items: [] });
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = await scrapeMenu(websiteUri);
    if (text.length < 100) {
      await supabase.from('restaurant_menu_cache').upsert({ place_id: placeId, top_items: [] });
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY missing');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: `Restaurant Name: ${placeName || 'Unknown'}\nCuisine: ${cuisine || 'General'}\n\nWebsite Text:\n${text}` }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Gemini API error');
    }

    const modelData = await response.json();
    const rawText = modelData?.candidates?.[0]?.content?.parts?.[0]?.text;
    let items: string[] = [];
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed.items)) {
          const rawItems = parsed.items.slice(0, 3);
          items = rawItems.map((item: any) => {
            if (typeof item === 'string') return item;
            const price = item.price ? ` - ${item.price}` : '';
            const desc = item.overview ? `: ${item.overview}` : '';
            return `${item.name}${price}${desc}`;
          });
        }
      } catch {}
    }

    await supabase.from('restaurant_menu_cache').upsert({ place_id: placeId, top_items: items });

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
