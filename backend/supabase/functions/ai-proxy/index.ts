// Supabase Edge Function: direct Groq-only weekly review by default.
// Provider requests are quota-gated and bounded before any response is returned.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createConfiguredAiHandler } from './ai-proxy-route.ts';

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

const readEnv = (name: string) => Deno.env.get(name);

// Missing, stale or unapproved routing configuration denies AI before quota is spent.
const handler = createConfiguredAiHandler({
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
  createServiceClient: signal => {
    const client = createClient(
      requiredEnvironmentVariable('SUPABASE_URL'),
      requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: requestBoundFetch(signal) },
      },
    );
    // Supabase returns a thenable builder; the core's asynchronous RPC boundary expects a Promise.
    return { rpc: async (name, args) => await client.rpc(name, args) };
  },
  corsHeaders,
}, readEnv);

Deno.serve(handler);
