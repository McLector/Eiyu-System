// Provider configuration for ai-proxy. Pure: reads names through an injected env getter and never logs a value.

export type ProviderKind = 'gemini' | 'openai';

export type Provider = {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  keyEnv: string;
  /** IANA zone whose midnight ends this provider's daily quota (Gemini resets at midnight Pacific). */
  resetTimeZone: string;
};

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const MAX_PROVIDERS = 8;

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const KEY_ENV_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

export type EnvGetter = (name: string) => string | undefined;
export type Warn = (message: string) => void;

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntry(entry: unknown, index: number, seen: Set<string>, warn: Warn): Provider | null {
  const reject = (field: string): null => {
    // Only the position and the field name are logged: a rejected value may be (or contain) a secret.
    warn(`ai-proxy: AI_PROVIDERS entry ${index} ignored: invalid ${field}`);
    return null;
  };
  if (!isPlainObject(entry)) return reject('entry');
  const { name, kind, model, keyEnv, baseUrl, resetTimeZone } = entry;
  if (typeof name !== 'string' || !NAME_RE.test(name)) return reject('name');
  if (seen.has(name)) return reject('name');
  if (kind !== 'gemini' && kind !== 'openai') return reject('kind');
  if (typeof model !== 'string' || !model.trim()) return reject('model');
  if (typeof keyEnv !== 'string' || !KEY_ENV_RE.test(keyEnv)) return reject('keyEnv');

  let resolvedBase: string;
  if (baseUrl === undefined || baseUrl === null) {
    if (kind === 'openai') return reject('baseUrl');
    resolvedBase = GEMINI_BASE_URL;
  } else {
    if (typeof baseUrl !== 'string') return reject('baseUrl');
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'https:') return reject('baseUrl');
    } catch {
      return reject('baseUrl');
    }
    resolvedBase = baseUrl.trim().replace(/\/+$/, '');
  }

  let zone = kind === 'gemini' ? 'America/Los_Angeles' : 'UTC';
  if (resetTimeZone !== undefined && resetTimeZone !== null) {
    if (typeof resetTimeZone !== 'string' || !isValidTimeZone(resetTimeZone)) return reject('resetTimeZone');
    zone = resetTimeZone;
  }

  seen.add(name);
  return { name, kind, baseUrl: resolvedBase, model: model.trim(), keyEnv, resetTimeZone: zone };
}

/**
 * Reads the ordered AI_PROVIDERS secret. Returns null when it is unset, unparsable or yields no valid entry; the
 * caller then keeps the implicit single-provider Gemini behaviour.
 */
export function parseProviders(getEnv: EnvGetter, warn: Warn = message => console.warn(message)): Provider[] | null {
  const raw = getEnv('AI_PROVIDERS');
  if (raw === undefined || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warn('ai-proxy: AI_PROVIDERS is not valid JSON; using the implicit Gemini configuration');
    return null;
  }
  if (!Array.isArray(parsed)) {
    warn('ai-proxy: AI_PROVIDERS must be a JSON array; using the implicit Gemini configuration');
    return null;
  }
  const seen = new Set<string>();
  const providers: Provider[] = [];
  parsed.forEach((entry, index) => {
    const provider = parseEntry(entry, index, seen, warn);
    if (provider) providers.push(provider);
  });
  if (providers.length === 0) {
    warn('ai-proxy: AI_PROVIDERS has no valid entry; using the implicit Gemini configuration');
    return null;
  }
  if (providers.length > MAX_PROVIDERS) {
    warn(`ai-proxy: AI_PROVIDERS lists more than ${MAX_PROVIDERS} providers; the extra ones are ignored`);
  }
  return providers.slice(0, MAX_PROVIDERS);
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(zone: string, ms: number): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour === 24 ? 0 : values.hour, minute: values.minute, second: values.second,
  };
}

function offsetMs(zone: string, ms: number): number {
  const p = localParts(zone, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant of the next local midnight in `zone` (the same rule as private.ai_next_midnight in migration 045). */
export function nextMidnightMs(zone: string, fromMs: number): number {
  const p = localParts(zone, fromMs);
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0);
  let instant = wallMidnight - offsetMs(zone, fromMs);
  // The offset can differ across a DST change between now and then; settle on the offset in force at the result.
  instant = wallMidnight - offsetMs(zone, instant);
  return instant;
}
