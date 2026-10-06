import { accountDateKey } from '@eiyu/shared';
import type { Quest } from '@eiyu/shared';

/**
 * The offline write queue's model: plain data and pure functions, no React and no storage. The provider in
 * contexts/write-queue.tsx owns persistence and the flush; everything that decides what a write means lives here.
 *
 * The server refuses any completion date other than the account's current date and none of the RPCs take a request id,
 * so a queued write only lands the day it was made (otherwise it expires) and an uncertain one re-reads server state
 * before it is resent.
 */

export type QueueKind = 'complete' | 'undo' | 'progress' | 'recovery';
export type QueueStatus = 'pending' | 'sending' | 'uncertain' | 'failed';
export type FailureReason = 'day-passed' | 'recovery-closed' | 'not-on-board' | 'progress-changed' | 'server';

export interface QueueFailure {
  reason: FailureReason;
  message: string;
}

export interface QueueEntry {
  id: string;
  userId: string;
  kind: QueueKind;
  habitId: string;
  /** Account-zone date the write was made on. */
  accountDate: string;
  /** Progress only: net change. */
  delta?: number;
  /** Progress only: the count the write started from, used to recognise an applied write. */
  base?: number;
  /** The quest's name when the write was made, so a failure can name it even if the quest has left the board. */
  label?: string;
  createdAt: number;
  attempts: number;
  status: QueueStatus;
  failure?: QueueFailure;
}

export interface EnqueueInput {
  id: string;
  userId: string;
  kind: QueueKind;
  habitId: string;
  accountDate: string;
  delta?: number;
  base?: number;
  label?: string;
  now: number;
}

export const FAILURE_MESSAGES: Record<FailureReason, string> = {
  'day-passed': 'Not saved: the day ended while you were offline.',
  'recovery-closed': 'Not saved: the recovery window closed.',
  'not-on-board': "Not saved: this quest is no longer on today's board.",
  'progress-changed': 'Not saved: the progress changed somewhere else.',
  server: 'Not saved: the server refused this update.',
};

const KINDS: readonly QueueKind[] = ['complete', 'undo', 'progress', 'recovery'];
const STATUSES: readonly QueueStatus[] = ['pending', 'sending', 'uncertain', 'failed'];
const STORAGE_VERSION = 1;

/** True for the errors fetch/supabase-js throw when there is no connection. */
export function isOfflineNetworkFailure(error: unknown): boolean {
  const message = errorMessage(error);
  return /network request failed|failed to fetch|networkerror|load failed/i.test(message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return String(error);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function sameSlot(a: QueueEntry, input: EnqueueInput): boolean {
  return a.habitId === input.habitId && a.accountDate === input.accountDate;
}

/** Adds a write, folding it into the habit's newest pending entry where the two cancel or merge. Never mutates. */
export function enqueue(entries: readonly QueueEntry[], input: EnqueueInput): QueueEntry[] {
  if (input.kind === 'progress' && (typeof input.delta !== 'number' || !Number.isFinite(input.delta))) {
    throw new Error('A progress write needs a numeric delta.');
  }
  const fresh: QueueEntry = {
    id: input.id,
    userId: input.userId,
    kind: input.kind,
    habitId: input.habitId,
    accountDate: input.accountDate,
    ...(input.kind === 'progress' ? { delta: input.delta, base: input.base } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    createdAt: input.now,
    attempts: 0,
    status: 'pending',
  };

  // Only the habit's newest live entry can fold with the new one: ordering means nothing may jump over it.
  let lastIndex = -1;
  entries.forEach((entry, index) => {
    if (entry.habitId === input.habitId && entry.status !== 'failed') lastIndex = index;
  });
  const last = lastIndex >= 0 ? entries[lastIndex] : undefined;

  if (last && last.status === 'pending' && sameSlot(last, input)) {
    const opposite = (last.kind === 'complete' && input.kind === 'undo') || (last.kind === 'undo' && input.kind === 'complete');
    if (opposite) return entries.filter((_, index) => index !== lastIndex);
    if (last.kind === 'recovery' && input.kind === 'recovery') return [...entries];
    if (last.kind === 'progress' && input.kind === 'progress') {
      const delta = (last.delta ?? 0) + (input.delta ?? 0);
      if (delta === 0) return entries.filter((_, index) => index !== lastIndex);
      return entries.map((entry, index) => (index === lastIndex ? { ...entry, delta } : entry));
    }
  }
  return [...entries, fresh];
}

/** A write made on an earlier account day cannot land (the server only accepts today). Recovery has no client date. */
export function isExpired(entry: QueueEntry, now: Date, timeZone: string): boolean {
  if (entry.kind === 'recovery') return false;
  return entry.accountDate !== accountDateKey(now, timeZone);
}

export type ErrorOutcome =
  | { type: 'network' }
  | { type: 'applied' }
  | { type: 'auth' }
  | { type: 'retry'; message: string }
  | { type: 'failed'; reason: FailureReason; message: string };

function failed(reason: FailureReason): ErrorOutcome {
  return { type: 'failed', reason, message: FAILURE_MESSAGES[reason] };
}

export function classifyError(kind: QueueKind, error: unknown): ErrorOutcome {
  if (isOfflineNetworkFailure(error)) return { type: 'network' };
  const message = errorMessage(error);
  const code = errorCode(error);
  if (kind === 'complete' && code === '23505') return { type: 'applied' };
  if (/authentication required|jwt expired|invalid jwt/i.test(message) || code === 'PGRST301') return { type: 'auth' };
  if (/current account date/i.test(message)) return failed('day-passed');
  if (kind === 'recovery' && /expired|no recovery window/i.test(message)) return failed('recovery-closed');
  if (/not eligible|not found|not a quantity habit/i.test(message)) return failed('not-on-board');
  return { type: 'retry', message };
}

export type UncertainResolution = { action: 'send' } | { action: 'drop' } | { action: 'fail'; reason: FailureReason };

/** What to do with an entry whose last attempt may or may not have reached the server, given fresh server state. */
export function resolveUncertain(entry: QueueEntry, quest: Quest | undefined): UncertainResolution {
  // A recovery's quest may be on the board only while its window is open, so a missing quest says nothing about whether
  // it landed. Replaying one is safe (the server answers already_recovered), and a refusal is classified when it is sent.
  if (entry.kind === 'recovery') return { action: 'send' };
  if (!quest) return { action: 'fail', reason: 'not-on-board' };
  switch (entry.kind) {
    case 'complete':
      return { action: quest.completed ? 'drop' : 'send' };
    case 'undo':
      return { action: quest.completed ? 'send' : 'drop' };
    case 'progress': {
      if (quest.targetCount == null) return { action: 'fail', reason: 'not-on-board' };
      const base = entry.base ?? 0;
      const expected = clamp(base + (entry.delta ?? 0), 0, quest.targetCount);
      if (quest.progressCount === expected) return { action: 'drop' };
      if (quest.progressCount === base) return { action: 'send' };
      return { action: 'fail', reason: 'progress-changed' };
    }
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** The board as the user sees it: server truth with their unsent writes laid on top. */
export function applyOverlay(quests: Quest[], entries: readonly QueueEntry[], today: string): Quest[] {
  const live = entries
    .filter(entry => entry.status !== 'failed' && (entry.kind === 'recovery' || entry.accountDate === today))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (live.length === 0) return quests;
  const byHabit = new Map<string, QueueEntry[]>();
  for (const entry of live) byHabit.set(entry.habitId, [...(byHabit.get(entry.habitId) ?? []), entry]);

  return quests.map(quest => {
    const list = byHabit.get(quest.id);
    if (!list) return quest;
    let next = quest;
    for (const entry of list) {
      if (entry.kind === 'complete') next = { ...next, completed: true };
      else if (entry.kind === 'undo') next = { ...next, completed: false };
      else if (entry.kind === 'recovery') next = { ...next, frozen: false };
      else if (next.targetCount != null) {
        const progressCount = clamp(next.progressCount + (entry.delta ?? 0), 0, next.targetCount);
        next = { ...next, progressCount, completed: progressCount >= next.targetCount };
      }
    }
    return next;
  });
}

export type SyncState = 'pending' | 'checking' | 'failed';

/** The tag a single entry earns, or null when it is just being sent (a tap while online must not flash a notice). */
function tagFor(entry: QueueEntry, offline: boolean): SyncState | null {
  if (entry.status === 'failed') return 'failed';
  if (entry.status === 'uncertain') return 'checking';
  if (entry.status === 'pending' && (offline || entry.attempts > 0)) return 'pending';
  return offline && entry.status === 'sending' ? 'pending' : null;
}

/** One tag per habit for the Board: failed beats checking beats pending. */
export function syncStateByHabit(entries: readonly QueueEntry[], offline: boolean): Map<string, SyncState> {
  const rank: Record<SyncState, number> = { pending: 0, checking: 1, failed: 2 };
  const result = new Map<string, SyncState>();
  for (const entry of entries) {
    const state = tagFor(entry, offline);
    if (state === null) continue;
    const current = result.get(entry.habitId);
    if (current === undefined || rank[state] > rank[current]) result.set(entry.habitId, state);
  }
  return result;
}

/** Changes the notice reports as waiting to sync. Failed ones have their own summary. */
export function waitingCount(entries: readonly QueueEntry[], offline: boolean): number {
  return entries.filter(entry => {
    const tag = tagFor(entry, offline);
    return tag === 'pending' || tag === 'checking';
  }).length;
}

/** What a write was, in a word, for the review list. */
export function describeEntry(entry: QueueEntry): string {
  switch (entry.kind) {
    case 'complete':
      return 'Complete';
    case 'undo':
      return 'Undo';
    case 'recovery':
      return 'Recovery';
    case 'progress': {
      const delta = entry.delta ?? 0;
      return delta < 0 ? `Progress −${Math.abs(delta)}` : `Progress +${delta}`;
    }
  }
}

export function encodeQueue(entries: readonly QueueEntry[]): string {
  return JSON.stringify({ v: STORAGE_VERSION, entries });
}

function isEntry(value: unknown): value is QueueEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.userId === 'string' &&
    typeof e.habitId === 'string' &&
    typeof e.accountDate === 'string' &&
    typeof e.createdAt === 'number' &&
    typeof e.attempts === 'number' &&
    KINDS.includes(e.kind as QueueKind) &&
    STATUSES.includes(e.status as QueueStatus) &&
    (e.kind !== 'progress' || typeof e.delta === 'number')
  );
}

/** Never throws: anything unreadable is an empty queue. Entries of another user are dropped. */
export function decodeQueue(raw: string | null | undefined, userId: string): QueueEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const { v, entries } = parsed as { v?: unknown; entries?: unknown };
    if (v !== STORAGE_VERSION || !Array.isArray(entries)) return [];
    return entries.filter(isEntry).filter(entry => entry.userId === userId);
  } catch {
    return [];
  }
}

/** Fails every pending or uncertain entry from an earlier account day. A sending one is left for its in-flight request. */
export function expireEntries(entries: readonly QueueEntry[], now: Date, timeZone: string | null): QueueEntry[] {
  // Without the account zone the day cannot be judged; the device zone would be a guess that could expire a current write.
  if (timeZone === null) return entries as QueueEntry[];
  let changed = false;
  const next = entries.map(entry => {
    if ((entry.status !== 'pending' && entry.status !== 'uncertain') || !isExpired(entry, now, timeZone)) return entry;
    changed = true;
    return { ...entry, status: 'failed' as const, failure: { reason: 'day-passed' as const, message: FAILURE_MESSAGES['day-passed'] } };
  });
  return changed ? next : (entries as QueueEntry[]);
}

/** After a launch: a write caught mid-send becomes uncertain, and one from an earlier account day is failed. */
export function reviveEntries(entries: readonly QueueEntry[], now: Date, timeZone: string | null): QueueEntry[] {
  const revived = entries.map(entry => (entry.status === 'sending' ? { ...entry, status: 'uncertain' as const } : entry));
  return expireEntries(revived, now, timeZone);
}
