import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { Stat } from '../types/eiyu';
import {requireDebriefAccess, PROCESSING_ACCESS_MESSAGE, type ProcessingAccess} from '../data/processing-access';
import { requireMailboxProof, type MailboxStatus } from '../data/mailbox';
import { authorizationForOwner } from '../supabase/authorization';

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

/** Active weekly requests retain their client timeout. Legacy suggestion-cache
 * constants/pure helpers remain for compatibility; the stage entry point below
 * is deliberately paused and no longer reads or recreates persistent caches. */

export const AI_TIMEOUT_MS = 20_000;
export const AI_SUGGESTIONS_STORAGE_KEY = 'eiyu:ai-suggestions';
export const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedSuggestions {
  at: number;
  value: string[];
}

export type SuggestionCache = Record<string, CachedSuggestions>;

export type SuggestionAction = 'stage-breakdown';

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

/**
 * invoke + hard timeout. The underlying request is not aborted (supabase-js
 * has no signal plumbing here) but the caller regains control immediately.
 */
async function invokeAiProxy<T>(body: Record<string, unknown>, authorization?: string): Promise<T> {
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
        const { data, error } = await supabase.functions.invoke('ai-proxy', { body, ...(authorization ? {headers: {Authorization: authorization}} : {}) });
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

export const STAGE_SUGGESTIONS_PAUSED_MESSAGE = 'Stage suggestions are unavailable while their privacy requirements are reviewed.';

/** No current UI caller. Never replace retired cache reads with extra provider requests. */
export async function suggestStages(_questName: string, _stat: Stat): Promise<string[]> {
  throw new Error(STAGE_SUGGESTIONS_PAUSED_MESSAGE);
}

/** No longer sent: the server builds the weekly evidence. Kept as an exported type for older callers. */
export interface WeeklySummaryHabitDatum {
  name: string;
  stat: Stat;
  fullCount: number;
  easyCount: number;
}

/**
 * R-60: raw call to the ai-proxy for a weekly summary paragraph - generate-once-per-week caching lives in data/weekly-summary.ts, so no local TTL cache here.
 * The body is metadata only: the week and the captured processing revisions. Habit text and totals are built on the server.
 */
export async function generateWeeklySummary(
  weekStart: string,
  expected?: {access: ProcessingAccess; mailbox: Pick<MailboxStatus, 'userId' | 'version'>}
): Promise<string> {
  const mailbox = await requireMailboxProof(expected?.mailbox);
  const access = await requireDebriefAccess('generate', expected?.access);
  if (mailbox.userId !== access.userId) throw new Error('Verify your email to access your weekly debrief.');
  const authorization = await authorizationForOwner(access.userId, PROCESSING_ACCESS_MESSAGE);
  await requireDebriefAccess('generate', access);
  await requireMailboxProof(mailbox);
  const data = await invokeAiProxy<{ summary?: string }>({
    action: 'weekly-summary',
    weekStart,
    processingAccess: {contractVersion: 1, ageVersion: access.ageVersion, mailboxVersion: access.mailboxVersion,
      consentVersion: access.consentVersion, authorityVersion: access.authorityVersion},
  }, authorization);
  if (!data?.summary) throw new Error('No summary returned');
  await requireDebriefAccess('generate', access);
  await requireMailboxProof(mailbox);
  return data.summary;
}
