// Supabase Edge Function (Deno runtime) — the only place the Gemini API key
// is ever read. The client never sees it (R-63); every response here is a
// suggestion the client can edit or discard, never auto-saved (R-64).
//
// Deploy: supabase functions deploy ai-proxy
// Secret: supabase secrets set GEMINI_API_KEY=...  (free key from aistudio.google.com)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-3.6-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Calls Gemini with a JSON-array response schema so the model can't return anything but a string array. */
async function callGeminiForStringArray(system: string, user: string, maxItems: number): Promise<string[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            minItems: 1,
            maxItems,
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned no text content');

  // responseSchema constrains the shape but not always the surrounding
  // prose — pull out the array literal rather than assuming text is bare JSON.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Gemini response had no JSON array: ${text}`);
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

async function suggestEasyVersions(habitName: string, stat: string): Promise<string[]> {
  const suggestions = await callGeminiForStringArray(
    'You suggest scaled-down "easy version" fallbacks for daily habits — something that takes ' +
      'about 2 minutes, keeps a streak alive on a bad day, and is clearly a smaller version of the ' +
      'same habit. Return exactly 3 short strings (under 8 words each). No prose, no explanation.',
    `Habit: "${habitName}" (stat: ${stat})`,
    3
  );
  if (suggestions.length === 0) throw new Error('No suggestions returned');
  return suggestions.slice(0, 3);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();

    switch (body.action) {
      case 'easy-versions': {
        const { habitName, stat } = body;
        if (typeof habitName !== 'string' || !habitName.trim()) {
          return json({ error: 'habitName is required' }, 400);
        }
        const suggestions = await suggestEasyVersions(habitName.trim(), stat ?? '');
        return json({ suggestions });
      }
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
