import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Stat } from '@eiyu/shared';

interface AiProxyError {
  error: string;
}

/**
 * On a non-2xx response, supabase-js throws a FunctionsHttpError whose own
 * `.message` is always the generic "Edge Function returned a non-2xx status
 * code" - it never reads the response body. ai-proxy always returns a JSON
 * `{ error }` body on failure, so read that back out here; fall back to the
 * SDK's error unchanged for anything that isn't a parseable HTTP error body
 * (a network-level FunctionsFetchError/FunctionsRelayError, or a body that
 * isn't the shape we expect).
 */
async function toAiProxyError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        return new Error(body.error);
      }
    } catch {
      // Response body wasn't parseable JSON - fall through.
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Improvement-pass #11 ("AI takes too long to respond"):
 * - a hard client timeout so the UI regains control with an actionable
 *   message instead of hanging on a spinner;
 * - a local TTL cache keyed by (action, name, stat) so repeat taps for the
 *   same input are instant and cost nothing.
 * Server-side latency was addressed separately: the edge function's array
 * responses dropped maxOutputTokens 2048 -> 512.
 */

export const AI_TIMEOUT_MS = 20_000;
export const AI_SUGGESTIONS_STORAGE_KEY = 'eiyu:ai-suggestions';
export const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedSuggestions {
  at: number;
  value: string[];
}

export type SuggestionCache = Record<string, CachedSuggestions>;

export type SuggestionAction = 'easy-versions' | 'stage-breakdown';

/** Pure: normalized cache key - case/whitespace-insensitive per input. */
export function suggestionCacheKey(
  action: SuggestionAction,
  name: string,
  stat: Stat
): string {
  return `${action}:${stat}:${name.trim().toLowerCase()}`;
}

/** Pure: a cache entry is usable only if fresh AND structurally sane. */
export function isFreshSuggestions(
  entry: CachedSuggestions | undefined,
  now: number = Date.now()
): entry is CachedSuggestions {
  return (
    !!entry &&
    typeof entry.at === 'number' &&
    now - entry.at < SUGGESTION_TTL_MS &&
    Array.isArray(entry.value)
  );
}

async function readSuggestionCache(): Promise<SuggestionCache> {
  const raw = await AsyncStorage.getItem(AI_SUGGESTIONS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeSuggestionCacheEntry(key: string, value: string[]): Promise<void> {
  const cache = await readSuggestionCache();
  cache[key] = { at: Date.now(), value };
  await AsyncStorage.setItem(AI_SUGGESTIONS_STORAGE_KEY, JSON.stringify(cache));
}

/**
 * invoke + hard timeout. The underlying request is not aborted (supabase-js
 * has no signal plumbing here) but the caller regains control immediately.
 */
async function invokeAiProxy<T>(body: Record<string, unknown>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('The AI took too long to respond. Try again in a moment.')),
      AI_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([
      (async () => {
        const { data, error } = await supabase.functions.invoke('ai-proxy', { body });
        if (error) throw await toAiProxyError(error);
        if (data && typeof data === 'object' && 'error' in data) {
          throw new Error((data as AiProxyError).error);
        }
        return data as T;
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** R-61: 3 AI-suggested easy versions, always optional (R-64). Runs through the ai-proxy Edge Function so no API key ships in the app (R-63). */
export async function suggestEasyVersions(habitName: string, stat: Stat): Promise<string[]> {
  const key = suggestionCacheKey('easy-versions', habitName, stat);
  const cached = (await readSuggestionCache())[key];
  if (isFreshSuggestions(cached)) return cached.value;

  const data = await invokeAiProxy<{ suggestions?: string[] }>({
    action: 'easy-versions',
    habitName: habitName.trim(),
    stat,
  });
  if (!data?.suggestions) throw new Error('No suggestions returned');
  await writeSuggestionCacheEntry(key, data.suggestions);
  return data.suggestions;
}

/** R-62: break a Long Quest name into 3-6 editable stages, always optional (R-64). */
export async function suggestStages(questName: string, stat: Stat): Promise<string[]> {
  const key = suggestionCacheKey('stage-breakdown', questName, stat);
  const cached = (await readSuggestionCache())[key];
  if (isFreshSuggestions(cached)) return cached.value;

  const data = await invokeAiProxy<{ stages?: string[] }>({
    action: 'stage-breakdown',
    questName: questName.trim(),
    stat,
  });
  if (!data?.stages) throw new Error('No stages returned');
  await writeSuggestionCacheEntry(key, data.stages);
  return data.stages;
}

export interface WeeklySummaryHabitDatum {
  name: string;
  stat: Stat;
  fullCount: number;
  easyCount: number;
}

/** R-60: raw call to the ai-proxy for a weekly summary paragraph — generate-once-per-week caching lives in lib/weekly-summary.ts, so no local TTL cache here. */
export async function generateWeeklySummary(
  weekStart: string,
  habits: WeeklySummaryHabitDatum[],
  statTotals: Record<Stat, number>
): Promise<string> {
  const data = await invokeAiProxy<{ summary?: string }>({
    action: 'weekly-summary',
    weekStart,
    habits,
    statTotals,
  });
  if (!data?.summary) throw new Error('No summary returned');
  return data.summary;
}