// Supabase Edge Function (Deno runtime) — the only place the Gemini API key
// is ever read. The client never sees it (R-63); every response here is a
// suggestion the client can edit or discard, never auto-saved (R-64).
//
// Deploy: supabase functions deploy ai-proxy
// Secret: supabase secrets set GEMINI_API_KEY=...  (free key from aistudio.google.com)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-3.6-flash';

// Native mobile requests never send an Origin header, so this list has no
// effect on iOS/Android — it only gates browser fetch() calls from web.
//
// This is NOT the security boundary: every request still needs a valid
// Authorization bearer token, and RLS governs the data underneath it. CORS
// only controls which origins a *browser* will let read the response, not
// who can call the endpoint — an unlisted origin can still hit this function
// directly (curl, server-to-server), it just can't read the reply via
// fetch(). Keep that in mind before tightening this list for "security" —
// it isn't one, and over-tightening just breaks legitimate preview deploys.
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:5173',
];

const PRODUCTION_ORIGIN = 'https://eiyu-system.vercel.app';

// Vercel preview URLs for this project are shaped
// eiyu-system-<branch-or-hash>-myres-projects.vercel.app — unpredictable
// per PR, so this is a pattern match scoped to this project's own preview
// deployments, not a bare *.vercel.app wildcard.
const PREVIEW_ORIGIN_RE = /^https:\/\/eiyu-system-[a-z0-9-]+-myres-projects\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin === PRODUCTION_ORIGIN || PREVIEW_ORIGIN_RE.test(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    // POST is a CORS-safelisted method so preflight passes without this today,
    // but stating it explicitly removes the "is that actually fine?" question.
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
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
          // Improvement-pass #11: a 3-6 item string array never needed 2048
          // tokens; the cap dominated end-to-end latency (deploy with
          // `supabase functions deploy ai-proxy` to take effect). The weekly
          // summary keeps its larger prose budget below.
          maxOutputTokens: 512,
          // Thinking is ON BY DEFAULT for every gemini-3.x model, and it is
          // the single largest latency contributor here. Rephrasing a habit
          // into a smaller version needs no chain of reasoning, so cap it at
          // the cheapest level the model offers ("off" is not available).
          thinkingConfig: { thinkingLevel: 'low' },
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

/** Calls Gemini for free-form prose — no response schema, since a paragraph isn't structured data. */
async function callGeminiForText(system: string, user: string): Promise<string> {
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
          // A 2-4 sentence paragraph is ~100 tokens; 4096 was never a real
          // budget, just an unbounded one. 1024 leaves generous headroom
          // (thinking tokens count against this too) while keeping the cap
          // meaningful.
          maxOutputTokens: 1024,
          // Same reasoning as above: the weekly summary reads a handful of
          // completion counts and writes two sentences about them. Default
          // thinking dominated the wait for no gain in the output.
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned no text content');
  // A tightened maxOutputTokens can truncate mid-sentence. Fail loudly rather
  // than caching half a paragraph into weekly_summaries for the whole week.
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was cut off by the output token limit');
  }
  return text.trim();
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

/** R-62: break a Long Quest name into 3-6 ordered, editable stages. */
async function suggestStages(questName: string, stat: string): Promise<string[]> {
  const stages = await callGeminiForStringArray(
    'You break a long-term goal into 3 to 6 ordered milestones — concrete, sequential steps ' +
      'that build toward finishing the goal, each short (under 8 words). Return between 3 and 6 ' +
      'strings, in the order they should be completed. No prose, no explanation.',
    `Goal: "${questName}" (stat: ${stat})`,
    6
  );
  if (stages.length < 2) throw new Error('Not enough stages returned');
  return stages.slice(0, 6);
}

interface HabitWeekDatum {
  name: string;
  stat: string;
  fullCount: number;
  easyCount: number;
}

/** R-60: a short paragraph — one real pattern, one thing going well, never guilt-based (R-15). */
async function summarizeWeek(
  weekStart: string,
  habits: HabitWeekDatum[],
  statTotals: Record<string, number>
): Promise<string> {
  const summary = await callGeminiForText(
    'You write a short weekly summary paragraph for a habit-tracking app. Use the JSON data of this ' +
      "week's habit completions to write 2-4 sentences, in second person (\"you\"), covering exactly " +
      'ONE real, specific pattern you notice in the data (e.g. a stat that is lagging or excelling, a ' +
      'habit completed consistently or missed several times) and ONE thing that is going well. Base ' +
      'everything strictly on the data given — never invent specifics. Tone must be neutral and ' +
      'encouraging, never guilty, shaming, or punitive — do not use words like "failed", "should have", ' +
      'or "missed" in a critical way; frame gaps factually. If the data is too sparse for a real pattern, ' +
      'say so gently instead of inventing one. Output ONLY the paragraph, no heading, no markdown.',
    JSON.stringify({ weekStart, habits, statTotals })
  );
  if (!summary) throw new Error('No summary returned');
  return summary;
}

Deno.serve(async req => {
  const cors = corsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401, cors);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401, cors);

    const body = await req.json();

    switch (body.action) {
      case 'easy-versions': {
        const { habitName, stat } = body;
        if (typeof habitName !== 'string' || !habitName.trim()) {
          return json({ error: 'habitName is required' }, 400, cors);
        }
        const suggestions = await suggestEasyVersions(habitName.trim(), stat ?? '');
        return json({ suggestions }, 200, cors);
      }
      case 'stage-breakdown': {
        const { questName, stat } = body;
        if (typeof questName !== 'string' || !questName.trim()) {
          return json({ error: 'questName is required' }, 400, cors);
        }
        const stages = await suggestStages(questName.trim(), stat ?? '');
        return json({ stages }, 200, cors);
      }
      case 'weekly-summary': {
        const { weekStart, habits, statTotals } = body;
        if (typeof weekStart !== 'string' || !Array.isArray(habits) || typeof statTotals !== 'object') {
          return json({ error: 'weekStart, habits, and statTotals are required' }, 400, cors);
        }
        const summary = await summarizeWeek(weekStart, habits, statTotals);
        return json({ summary }, 200, cors);
      }
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400, cors);
    }
  } catch (err) {
    // Finding 3: don't forward upstream (Gemini) error text to the client —
    // log it server-side (visible via `supabase functions logs ai-proxy`)
    // and return a fixed, generic message instead.
    console.error('[ai-proxy] request failed:', err);
    return json({ error: 'The AI request failed. Please try again.' }, 500, cors);
  }
});
