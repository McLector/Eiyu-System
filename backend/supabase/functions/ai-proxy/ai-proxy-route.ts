import { createAiProxyHandler } from './ai-proxy-core.ts';
import type { AiProxyDependencies } from './ai-proxy-core.ts';
import { createFailoverGenerator } from './ai-proxy-generator.ts';
import type { FailoverGeneratorOptions } from './ai-proxy-generator.ts';
import type { EnvGetter, Provider } from './ai-proxy-providers.ts';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
type RouteMode = 'groq-only' | 'gemini-only';

/** Reject the entire configuration, including extra entries/fields; never log raw values. */
function approvedProvider(raw: string | undefined, mode: RouteMode = 'groq-only'): Provider | null {
  try {
    const parsed: unknown = JSON.parse(raw ?? '');
    if (!Array.isArray(parsed) || parsed.length !== 1) return null;
    const entry = parsed[0];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const fields = ['name', 'kind', 'baseUrl', 'model', 'keyEnv', 'resetTimeZone'];
    if (Object.keys(entry).some(field => !fields.includes(field))) return null;
    const expected: Provider = mode === 'groq-only'
      ? { name: 'groq', kind: 'openai', baseUrl: GROQ_BASE_URL,
        model: 'openai/gpt-oss-20b', keyEnv: 'GROQ_API_KEY', resetTimeZone: 'UTC' }
      : { name: 'gemini', kind: 'gemini', baseUrl: GEMINI_BASE_URL,
        model: 'gemini-3.6-flash', keyEnv: 'GEMINI_API_KEY', resetTimeZone: 'America/Los_Angeles' };
    if (entry.name !== expected.name || entry.kind !== expected.kind || entry.model !== expected.model
      || entry.keyEnv !== expected.keyEnv || typeof entry.baseUrl !== 'string'
      || ![expected.baseUrl, expected.baseUrl + '/'].includes(entry.baseUrl)
      || (entry.resetTimeZone !== undefined && entry.resetTimeZone !== expected.resetTimeZone)) return null;
    return expected;
  } catch {
    return null;
  }
}

/** Production policy: one approved direct route, weekly review and stage suggestions only, fail closed before quota. */
export function createGroqOnlyHandler(
  dependencies: Omit<AiProxyDependencies, 'generate' | 'preflight' | 'allowedActions'>,
  getEnv: EnvGetter,
  options: Omit<FailoverGeneratorOptions, 'providers' | 'getKey' | 'returnRateLimits'> = {},
) {
  return singleProviderHandler(dependencies, getEnv, options, 'groq-only');
}

function singleProviderHandler(
  dependencies: Omit<AiProxyDependencies, 'generate' | 'preflight' | 'allowedActions'>,
  getEnv: EnvGetter,
  options: Omit<FailoverGeneratorOptions, 'providers' | 'getKey' | 'returnRateLimits'>,
  mode: RouteMode,
) {
  const provider = approvedProvider(getEnv('AI_PROVIDERS'), mode);
  const generate = createFailoverGenerator({ ...options, providers: provider ? [provider] : [],
    getKey: () => provider ? getEnv(provider.keyEnv) : undefined, returnRateLimits: true });
  return createAiProxyHandler({ ...dependencies, generate, allowedActions: ['weekly-summary', 'stage-breakdown'],
    preflight: () => {
      if (!provider || !getEnv(provider.keyEnv)?.trim()) throw new Error('Approved AI configuration missing.');
    },
  });
}

/** Production entry point: Groq only; retained Gemini support requires a future reviewed code change. */
export function createConfiguredAiHandler(
  dependencies: Omit<AiProxyDependencies, 'generate' | 'preflight' | 'allowedActions'>,
  getEnv: EnvGetter,
  options: Omit<FailoverGeneratorOptions, 'providers' | 'getKey' | 'returnRateLimits'> = {},
) {
  const mode = getEnv('AI_PROVIDER_MODE');
  if (mode === undefined || mode === 'groq-only') return createGroqOnlyHandler(dependencies, getEnv, options);
  // Explicit Gemini, unknown and blank modes must never restore a Gemini route.
  return createGroqOnlyHandler(dependencies, name => name === 'AI_PROVIDERS' ? undefined : getEnv(name), options);
}
