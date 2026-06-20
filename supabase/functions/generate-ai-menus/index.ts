import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const FETCH_USER_AGENT = 'Platebound/1.0 (menu-fetcher; contact: support@platebound.app)';

const SYSTEM_INSTRUCTION = `You are an expert culinary AI extracting menu items from restaurant website text.
Return JSON ONLY at the root: an object with a single key "items" whose value is an array of strings.
Each string must be a signature menu item or popular dish found in the text, ideally including a short description.
Limit to the top 3 best items.
If no food menu items can be confidently found, return an empty array [].`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: { type: 'STRING' },
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
  return text.replace(/\s+/g, ' ').trim().slice(0, 15000);
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
  let text = await fetchWebsiteText(websiteUri);
  if (text.length < 500 && websiteUri.endsWith('/')) {
    const menuUri = websiteUri + 'menu';
    const menuText = await fetchWebsiteText(menuUri);
    if (menuText.length > text.length) {
      text = menuText;
    }
  } else if (text.length < 500 && !websiteUri.endsWith('/')) {
    const menuUri = websiteUri + '/menu';
    const menuText = await fetchWebsiteText(menuUri);
    if (menuText.length > text.length) {
      text = menuText;
    }
  }
  return text;
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
    const { placeId, websiteUri } = await req.json();
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

    const geminiUrl = \`https://generativelanguage.googleapis.com/v1beta/models/\${GEMINI_MODEL}:generateContent?key=\${encodeURIComponent(geminiApiKey)}\`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: \`Extract from this text:\\n\${text}\` }] }],
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
          items = parsed.items.slice(0, 3);
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
