import type {
  AiAction,
  AiPayload,
  AiRequestContext,
  ProviderAttemptReservation,
} from './ai-proxy-core.ts';
import { nextMidnightMs } from './ai-proxy-providers.ts';
import type { Provider } from './ai-proxy-providers.ts';

export const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 3_000;
export const MAX_PROVIDER_ATTEMPTS = 4;
export const MAX_ATTEMPTS_PER_MODEL = 2;
const BACKOFF_BASE_MS = [250, 500, 500] as const;
const MAX_JITTER_MS = 100;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type Sleep = (milliseconds: number, signal: AbortSignal) => Promise<void>;
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type GeminiGeneratorOptions = {
  apiKey: string | (() => string);
  primaryModel: string;
  fallbackModel?: string;
  retryEnabled?: boolean;
  fetch?: Fetcher;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  sleep?: Sleep;
  random?: () => number;
  attemptTimeoutMs?: number;
};

export class GeminiProviderError extends Error {
  readonly kind: 'busy' | 'error' | 'exhausted';

  constructor(message = 'The AI provider could not complete the request.', kind: 'busy' | 'error' | 'exhausted' = 'error') {
    super(message);
    this.name = 'GeminiProviderError';
    this.kind = kind;
  }
}

export class GeminiRequestCancelledError extends Error {
  constructor() {
    super('The AI request was cancelled.');
    this.name = 'GeminiRequestCancelledError';
  }
}

class GeminiTransientError extends Error {
  constructor() {
    super('Transient AI provider failure.');
    this.name = 'GeminiTransientError';
  }
}

class GeminiQuotaError extends Error {
  constructor() {
    super('The AI provider reported an exhausted daily quota.');
    this.name = 'GeminiQuotaError';
  }
}

class GeminiReservationDeniedError extends Error {
  constructor() {
    super('Provider attempt quota was denied.');
    this.name = 'GeminiReservationDeniedError';
  }
}

class GeminiTerminalError extends Error {
  constructor() {
    super('The AI provider rejected the request.');
    this.name = 'GeminiTerminalError';
  }
}

class GeminiMalformedOutputError extends Error {
  constructor() {
    super('The AI provider returned an invalid result.');
    this.name = 'GeminiMalformedOutputError';
  }
}

class GeminiAttemptTimeoutError extends Error {
  constructor() {
    super('The AI provider attempt timed out.');
    this.name = 'GeminiAttemptTimeoutError';
  }
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new GeminiRequestCancelledError());
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new GeminiRequestCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  return new GeminiRequestCancelledError();
}

function awaitSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortReason(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function combineSignals(parent: AbortSignal): { signal: AbortSignal; abort: () => void; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason ?? new GeminiRequestCancelledError());
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    abort: () => controller.abort(new GeminiAttemptTimeoutError()),
    dispose: () => parent.removeEventListener('abort', onAbort),
  };
}

type Prompt = {
  system: string;
  user: string;
  kind: 'array' | 'text';
  maxItems?: number;
};

function promptFor(action: AiAction, payload: AiPayload): Prompt {
  switch (action) {
    case 'easy-versions':
      return {
        system: 'You suggest scaled-down "Penalty" fallbacks for daily habits — something that takes ' +
          'about 2 minutes, keeps a streak alive on a bad day, and is clearly a smaller version of the ' +
          'same habit. Return exactly 3 short strings (under 8 words each). No prose, no explanation.',
        user: `Habit: "${String(payload.habitName)}" (stat: ${String(payload.stat ?? '')})`,
        kind: 'array',
        maxItems: 3,
      };
    case 'stage-breakdown':
      return {
        system: 'You break a long-term goal into 3 to 6 ordered milestones — concrete, sequential steps ' +
          'that build toward finishing the goal, each short (under 8 words). Return between 3 and 6 ' +
          'strings, in the order they should be completed. No prose, no explanation.',
        user: `Goal: "${String(payload.questName)}" (stat: ${String(payload.stat ?? '')})`,
        kind: 'array',
        maxItems: 6,
      };
    case 'weekly-summary': {
      const habits = payload.habits as Array<{ name: string; stat: string; fullCount: number; easyCount: number }>;
      const statTotals = payload.statTotals as Record<string, number>;
      return {
        system: 'You write a short weekly summary paragraph for a habit-tracking app. Use the JSON data of this ' +
          "week's habit completions to write 2-4 sentences, in second person (\"you\"), covering exactly " +
          'ONE real, specific pattern you notice in the data (e.g. a stat that is lagging or excelling, a ' +
          'habit completed consistently or missed several times) and ONE thing that is going well. Base ' +
          'everything strictly on the data given — never invent specifics. Tone must be neutral and ' +
          'encouraging, never guilty, shaming, or punitive — do not use words like "failed", "should have", ' +
          'or "missed" in a critical way; frame gaps factually. If the data is too sparse for a real pattern, ' +
          'say so gently instead of inventing one. Output ONLY the paragraph, no heading, no markdown.',
        user: JSON.stringify({ weekStart: payload.weekStart, habits, statTotals }),
        kind: 'text',
      };
    }
  }
}

function requestBody(prompt: Prompt): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = prompt.kind === 'array'
    ? {
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        minItems: 1,
        maxItems: prompt.maxItems,
      },
    }
    : { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } };
  return {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
    generationConfig,
  };
}

// The separators are optional because quota ids are camelCase, e.g. GenerateRequestsPerDayPerProjectPerModel-FreeTier.
function hasDailyQuotaFailure(body: string): boolean {
  return /daily|per[\s_-]*day|\bRPD\b|quota.{0,40}(day|daily)|day.{0,40}quota/i.test(body);
}

function isClassifiedPerMinute429(body: string): boolean {
  return /per[\s_-]*minute|\bRPM\b|minute.{0,24}(limit|quota|rate)|rate.{0,24}per[\s_-]*minute/i.test(body);
}

function shouldRetryStatus(status: number, body: string): boolean {
  if ([408, 500, 502, 503, 504].includes(status)) return true;
  if (status !== 429 || hasDailyQuotaFailure(body)) return false;
  return isClassifiedPerMinute429(body);
}

function parseProviderText(value: unknown, action: AiAction, kind: Prompt['kind']): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) throw new GeminiMalformedOutputError();
  const text = value.trim();
  if (kind === 'text') return { summary: text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiMalformedOutputError();
  }
  if (!Array.isArray(parsed)) throw new GeminiMalformedOutputError();
  const strings = parsed.map(item => typeof item === 'string' ? item.trim() : '');
  if (strings.some(item => !item)) throw new GeminiMalformedOutputError();
  const expectedMin = action === 'easy-versions' ? 3 : 3;
  const expectedMax = action === 'easy-versions' ? 3 : 6;
  if (strings.length < expectedMin || strings.length > expectedMax) throw new GeminiMalformedOutputError();
  if (strings.some(item => item.split(/\s+/u).length > 7)) throw new GeminiMalformedOutputError();
  return action === 'easy-versions' ? { suggestions: strings } : { stages: strings };
}

function extractCandidateText(data: unknown, kind: Prompt['kind']): { text: string; truncated: boolean } {
  if (typeof data !== 'object' || data === null) throw new GeminiMalformedOutputError();
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates.length || typeof candidates[0] !== 'object' || candidates[0] === null) {
    throw new GeminiMalformedOutputError();
  }
  const candidate = candidates[0] as { content?: { parts?: unknown }; finishReason?: unknown };
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) throw new GeminiMalformedOutputError();
  const text = parts.find(part => typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string') as { text: string } | undefined;
  if (!text?.text.trim()) throw new GeminiMalformedOutputError();
  return { text: text.text, truncated: kind === 'text' && candidate.finishReason === 'MAX_TOKENS' };
}

function parseApiError(status: number, body: string): Error {
  if (shouldRetryStatus(status, body)) return new GeminiTransientError();
  if (status === 429 && hasDailyQuotaFailure(body)) return new GeminiQuotaError();
  return new GeminiTerminalError();
}

export function createGeminiGenerator(options: GeminiGeneratorOptions) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
  const retryEnabled = options.retryEnabled === true;

  return async function generate(
    action: AiAction,
    payload: AiPayload,
    reserveProviderAttempt: ProviderAttemptReservation,
    context: AiRequestContext,
  ): Promise<Record<string, unknown>> {
    const prompt = promptFor(action, payload);
    const primary = options.primaryModel.trim();
    const fallback = options.fallbackModel?.trim();
    const models = retryEnabled && fallback && fallback !== primary ? [primary, fallback] : [primary];
    const perModelLimit = retryEnabled ? MAX_ATTEMPTS_PER_MODEL : 1;
    const totalLimit = retryEnabled ? MAX_PROVIDER_ATTEMPTS : 1;
    let attemptNumber = 0;
    let lastTransient: Error | null = null;

    const callOnce = async (model: string, attempt: number): Promise<Record<string, unknown>> => {
      if (context.signal.aborted) throw new GeminiRequestCancelledError();
      if (context.now() >= context.deadlineAt) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
      const apiKey = typeof options.apiKey === 'function' ? options.apiKey() : options.apiKey;
      if (!apiKey) throw new GeminiTerminalError();
      if (!await reserveProviderAttempt(attempt)) throw new GeminiProviderError('Provider attempt quota was denied.');
      if (context.signal.aborted) throw new GeminiRequestCancelledError();
      if (context.now() >= context.deadlineAt) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
      const combined = combineSignals(context.signal);
      let timedOut = false;
      const remaining = Math.max(1, context.deadlineAt - context.now());
      const timer = setTimer(() => {
        timedOut = true;
        combined.abort();
      }, Math.min(attemptTimeoutMs, remaining));
      try {
        const responsePromise = fetcher(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(requestBody(prompt)),
          signal: combined.signal,
        });
        let response: Response;
        try {
          response = await awaitSignal(responsePromise, combined.signal);
        } catch (error) {
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          if (timedOut) throw new GeminiTransientError();
          // Fetch transport failures are transient; provider response parsing is handled below.
          throw new GeminiTransientError();
        }
        let responseText: string;
        try {
          responseText = await awaitSignal(response.text(), combined.signal);
        } catch {
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          if (timedOut) throw new GeminiTransientError();
          throw new GeminiTransientError();
        }
        if (!response.ok) throw parseApiError(response.status, responseText);
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new GeminiMalformedOutputError();
        }
        const candidate = extractCandidateText(data, prompt.kind);
        if (candidate.truncated) throw new GeminiMalformedOutputError();
        return parseProviderText(candidate.text, action, prompt.kind);
      } catch (error) {
        if (context.signal.aborted) throw new GeminiRequestCancelledError();
        if (timedOut && !(error instanceof GeminiTransientError)) throw new GeminiTransientError();
        throw error;
      } finally {
        clearTimer(timer);
        combined.dispose();
      }
    };

    for (const model of models) {
      for (let modelAttempt = 0; modelAttempt < perModelLimit && attemptNumber < totalLimit; modelAttempt++) {
        if (context.signal.aborted) throw new GeminiRequestCancelledError();
        if (context.now() >= context.deadlineAt) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
        attemptNumber++;
        try {
          return await callOnce(model, attemptNumber);
        } catch (error) {
          if (error instanceof GeminiRequestCancelledError) throw error;
          if (!(error instanceof GeminiTransientError)) throw new GeminiProviderError();
          lastTransient = error;
          const hasNext = attemptNumber < totalLimit && (modelAttempt + 1 < perModelLimit || models.indexOf(model) < models.length - 1);
          if (!hasNext) break;
          const base = BACKOFF_BASE_MS[Math.min(attemptNumber - 1, BACKOFF_BASE_MS.length - 1)];
          const jitter = Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(random() * (MAX_JITTER_MS + 1))));
          const delay = base + jitter;
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          if (context.deadlineAt - context.now() <= delay) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
          try {
            await sleep(delay, context.signal);
          } catch {
            if (context.signal.aborted) throw new GeminiRequestCancelledError();
            throw new GeminiProviderError('The AI request deadline expired.', 'busy');
          }
        }
      }
    }
    if (lastTransient) throw new GeminiProviderError('The AI service is busy.', 'busy');
    throw new GeminiProviderError();
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Multi-provider failover (slice 6). Used when the AI_PROVIDERS secret lists providers; otherwise index.ts keeps the
// single-provider generator above. Same bounds as there: 4 attempts, 3 s each, every attempt reserved before its fetch.
// ---------------------------------------------------------------------------------------------------------------

export type FailoverGeneratorOptions = {
  providers: Provider[];
  getKey: (keyEnv: string) => string | undefined;
  fetch?: Fetcher;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  sleep?: Sleep;
  random?: () => number;
  attemptTimeoutMs?: number;
  /** Wall clock used only to remember a quota exhaustion in memory until the provider's next reset. */
  wallClock?: () => number;
  /** Receives provider name, kind, attempt number and outcome only: never a key, prompt or provider body. */
  log?: (line: string) => void;
};

function openAiBody(provider: Provider, prompt: Prompt): Record<string, unknown> {
  const system = prompt.kind === 'array'
    ? `${prompt.system} Respond with ONLY a JSON array of strings, with no code fence and no other text.`
    : prompt.system;
  return {
    model: provider.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt.user },
    ],
    max_tokens: 1024,
    temperature: 0.4,
  };
}

/** Free reasoning models put a <think> block in `content`, and many wrap JSON in a code fence. */
function cleanOpenAiContent(content: string): string {
  let text = content.trim();
  if (/^<think>/i.test(text)) {
    const end = text.search(/<\/think>/i);
    if (end < 0) throw new GeminiMalformedOutputError();
    text = text.slice(end + '</think>'.length).trim();
  }
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function extractOpenAiText(data: unknown): string {
  if (typeof data !== 'object' || data === null) throw new GeminiMalformedOutputError();
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || typeof choices[0] !== 'object' || choices[0] === null) throw new GeminiMalformedOutputError();
  const choice = choices[0] as { message?: { content?: unknown }; finish_reason?: unknown };
  const content = choice.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new GeminiMalformedOutputError();
  if (choice.finish_reason === 'length') throw new GeminiMalformedOutputError();
  const text = cleanOpenAiContent(content);
  if (!text) throw new GeminiMalformedOutputError();
  return text;
}

export function createFailoverGenerator(options: FailoverGeneratorOptions) {
  const fetcher = options.fetch ?? fetch;
  const setTimer = options.setTimeout ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
  const wallClock = options.wallClock ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  // Remembers daily-quota exhaustion inside this isolate, so a database without migration 045 (or a failed mark)
  // still stops hammering a provider that already said it was out for the day.
  const localExhausted = new Map<string, number>();

  return async function generate(
    action: AiAction,
    payload: AiPayload,
    reserveProviderAttempt: ProviderAttemptReservation,
    context: AiRequestContext,
  ): Promise<Record<string, unknown>> {
    const prompt = promptFor(action, payload);
    const usable = options.providers.filter(provider => (options.getKey(provider.keyEnv) ?? '').trim() !== '');
    if (!usable.length) throw new GeminiProviderError();

    const databaseExhausted = new Set(context.exhaustedProviders ?? []);
    const isExhausted = (provider: Provider) =>
      databaseExhausted.has(provider.name) || (localExhausted.get(provider.name) ?? 0) > wallClock();
    let queue = usable.filter(provider => !isExhausted(provider));
    if (!queue.length) throw new GeminiProviderError('Every AI provider is out of quota for today.', 'exhausted');

    const attemptOnce = async (provider: Provider, attempt: number, outcome: { status?: number }): Promise<Record<string, unknown>> => {
      const apiKey = (options.getKey(provider.keyEnv) ?? '').trim();
      if (!await reserveProviderAttempt(attempt)) throw new GeminiReservationDeniedError();
      if (context.signal.aborted) throw new GeminiRequestCancelledError();
      if (context.now() >= context.deadlineAt) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
      const combined = combineSignals(context.signal);
      let timedOut = false;
      const remaining = Math.max(1, context.deadlineAt - context.now());
      const timer = setTimer(() => {
        timedOut = true;
        combined.abort();
      }, Math.min(attemptTimeoutMs, remaining));
      try {
        const request: { url: string; headers: Record<string, string>; body: Record<string, unknown> } = provider.kind === 'gemini'
          ? {
            url: `${provider.baseUrl}/${encodeURIComponent(provider.model)}:generateContent`,
            headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
            body: requestBody(prompt),
          }
          : {
            url: `${provider.baseUrl}/chat/completions`,
            headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body: openAiBody(provider, prompt),
          };
        let response: Response;
        try {
          response = await awaitSignal(
            fetcher(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: combined.signal }),
            combined.signal,
          );
        } catch {
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          throw new GeminiTransientError();
        }
        outcome.status = response.status;
        let responseText: string;
        try {
          responseText = await awaitSignal(response.text(), combined.signal);
        } catch {
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          throw new GeminiTransientError();
        }
        if (!response.ok) throw parseApiError(response.status, responseText);
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new GeminiMalformedOutputError();
        }
        if (provider.kind === 'gemini') {
          const candidate = extractCandidateText(data, prompt.kind);
          if (candidate.truncated) throw new GeminiMalformedOutputError();
          return parseProviderText(candidate.text, action, prompt.kind);
        }
        return parseProviderText(extractOpenAiText(data), action, prompt.kind);
      } catch (error) {
        if (context.signal.aborted) throw new GeminiRequestCancelledError();
        if (timedOut && !(error instanceof GeminiTransientError)) throw new GeminiTransientError();
        throw error;
      } finally {
        clearTimer(timer);
        combined.dispose();
      }
    };

    const failedTransient: Provider[] = [];
    let secondPass = false;
    let retries = 0;
    let attemptNumber = 0;
    let failures = 0;
    let quotaFailures = 0;
    let transientSeen = false;

    while (attemptNumber < MAX_PROVIDER_ATTEMPTS) {
      if (!queue.length) {
        // Breadth first: only once every provider has had a try do the transient failures get a second chance.
        if (secondPass || !failedTransient.length) break;
        secondPass = true;
        queue = failedTransient.splice(0);
      }
      if (context.signal.aborted) throw new GeminiRequestCancelledError();
      if (context.now() >= context.deadlineAt) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
      const provider = queue.shift()!;
      if (isExhausted(provider)) continue;

      if (secondPass) {
        const base = BACKOFF_BASE_MS[Math.min(retries, BACKOFF_BASE_MS.length - 1)];
        retries++;
        const jitter = Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(random() * (MAX_JITTER_MS + 1))));
        const delay = base + jitter;
        if (context.deadlineAt - context.now() <= delay) throw new GeminiProviderError('The AI request deadline expired.', 'busy');
        try {
          await sleep(delay, context.signal);
        } catch {
          if (context.signal.aborted) throw new GeminiRequestCancelledError();
          throw new GeminiProviderError('The AI request deadline expired.', 'busy');
        }
      }

      attemptNumber++;
      const outcome: { status?: number } = {};
      try {
        return await attemptOnce(provider, attemptNumber, outcome);
      } catch (error) {
        if (error instanceof GeminiRequestCancelledError) throw error;
        if (error instanceof GeminiReservationDeniedError) throw new GeminiProviderError('Provider attempt quota was denied.');
        if (error instanceof GeminiProviderError) throw error;
        failures++;
        const label = error instanceof GeminiTransientError ? 'transient'
          : error instanceof GeminiQuotaError ? 'daily-quota'
          : error instanceof GeminiMalformedOutputError ? 'malformed'
          : 'rejected';
        log(`ai-proxy: provider=${provider.name} kind=${provider.kind} attempt=${attemptNumber} status=${outcome.status ?? 'none'} outcome=${label}`);
        if (error instanceof GeminiTransientError) {
          transientSeen = true;
          if (!secondPass) failedTransient.push(provider);
        } else if (error instanceof GeminiQuotaError) {
          quotaFailures++;
          localExhausted.set(provider.name, nextMidnightMs(provider.resetTimeZone, wallClock()));
          try {
            await context.markProviderExhausted?.(provider.name, provider.resetTimeZone);
          } catch {
            // Best effort: the in-memory mark above still protects this isolate.
          }
        }
      }
    }

    if (transientSeen) throw new GeminiProviderError('The AI service is busy.', 'busy');
    if (quotaFailures > 0 && quotaFailures === failures) {
      throw new GeminiProviderError('Every AI provider is out of quota for today.', 'exhausted');
    }
    throw new GeminiProviderError();
  };
}
