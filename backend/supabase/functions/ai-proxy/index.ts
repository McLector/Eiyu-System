// Supabase Edge Function (Deno runtime) — the only place the Gemini API key
// is read. Provider requests are quota-gated and bounded before any response
// is returned to the client.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createAiProxyHandler } from './ai-proxy-core.ts';
import { createGeminiGenerator } from './ai-proxy-generator.ts';

const DEFAULT_PRIMARY_MODEL = 'gemini-3.6-flash';

// Native mobile requests never send an Origin header, so this list only gates
// browser fetch() calls. Authorization and RLS remain the security boundary.
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:5173',
];

const PRODUCTION_ORIGIN = 'https://eiyu-system.vercel.app';
const PREVIEW_ORIGIN_RE = /^https:\/\/eiyu-system-[a-z0-9-]+-myres-projects\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin === PRODUCTION_ORIGIN || PREVIEW_ORIGIN_RE.test(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function requiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function requestBoundFetch(signal: AbortSignal): typeof fetch {
  return (input, init = {}) => {
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    return fetch(input, { ...init, signal });
  };
}

const generate = createGeminiGenerator({
  apiKey: () => requiredEnvironmentVariable('GEMINI_API_KEY'),
  primaryModel: Deno.env.get('GEMINI_PRIMARY_MODEL')?.trim() || DEFAULT_PRIMARY_MODEL,
  fallbackModel: Deno.env.get('GEMINI_FALLBACK_MODEL')?.trim() || undefined,
  // Stage one deploys this same fail-closed quota gate with retries disabled.
  // Enable only after SQL 030 is verified and fallback access is confirmed.
  retryEnabled: Deno.env.get('AI_RETRY_ENABLED') === 'true',
});

const handler = createAiProxyHandler({
  preflight: () => { requiredEnvironmentVariable('GEMINI_API_KEY'); },
  createUserClient: (authorization, signal) => createClient(
    requiredEnvironmentVariable('SUPABASE_URL'),
    requiredEnvironmentVariable('SUPABASE_ANON_KEY'),
    {
      global: {
        headers: { Authorization: authorization },
        fetch: requestBoundFetch(signal),
      },
    },
  ),
  createServiceClient: signal => createClient(
    requiredEnvironmentVariable('SUPABASE_URL'),
    requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: requestBoundFetch(signal) },
    },
  ),
  corsHeaders,
  generate,
});

Deno.serve(handler);
