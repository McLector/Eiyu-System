import type { TrackerRevision, TrackerTargetSnapshot } from './tracker-access';
import { invokeTrackerWrite, trackerErrorKind } from './tracker-writes';
import { accountDateKey, deviceTimeZone } from '../logic/date-utils';
import { CompletionKind } from '../types/database';
import { Stat } from '../types/eiyu';

function todayKey(timeZone: string) {
  return accountDateKey(new Date(), timeZone);
}

/**
 * R-05/R-06: record a completion and award XP (R-21) ATOMICALLY via the
 * complete_habit RPC (migration 012, XP made server-side in 014). Previously
 * this was an insert followed by a separate increment_stat_xp call - two
 * network round-trips where a crash between them desynced history vs stats.
 * `completedOn` defaults to today. Migration 022 restricts this operation to
 * the account's current product date; missed-day recovery has its own RPC.
 */
export async function completeHabit(
  userId: string,
  habitId: string,
  stat: Stat,
  kind: CompletionKind,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[],
  completedOn?: string,
  timeZone: string = deviceTimeZone()
): Promise<void> {
  // userId/stat stay in the signature for API stability; both are resolved
  // server-side by the RPC (auth.uid(), habit lookup) so client and DB can't
  // disagree — as of migration 014, so is the XP amount (see 014's comment).
  void userId;
  void stat;

  const date = completedOn ?? todayKey(timeZone);
  // Checked here so the only 22023 left to explain is the server's duplicate-completion refusal.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (kind !== 'full' && kind !== 'easy')) throw new Error('This completion could not be prepared.');
  try {
    await invokeTrackerWrite<unknown>('complete_habit', { p_habit_id: habitId, p_completed_on: date, p_kind: kind }, expected, targets);
  } catch (error) {
    // A second completion for the same habit and day is refused as 22023: it is already recorded, never a second row.
    if (trackerErrorKind(error) === 'invalid-input') return;
    throw error;
  }
}

export type RecoveryCompletionStatus = 'recovered' | 'already_recovered';

/**
 * Resolve the caller's open recovery window. The server owns the missed date,
 * deadline, XP, and clock so the client cannot forge or extend the window.
 */
export async function completeHabitRecovery(
  habitId: string,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[]
): Promise<RecoveryCompletionStatus> {
  const data = await invokeTrackerWrite<unknown>('complete_habit_recovery', { p_habit_id: habitId }, expected, targets);

  const status = (data as { status?: string } | null)?.status;
  if (status === 'expired') throw new Error('Recovery window has expired');
  if (status === 'no_open_recovery') {
    throw new Error('No recovery window is available');
  }
  if (status !== 'recovered' && status !== 'already_recovered') {
    throw new Error('Unexpected recovery result');
  }
  return status;
}

/**
 * R-07: undo today's completion and reverse the XP it awarded — ATOMICALLY
 * via the undo_habit_completion RPC (migration 013), mirroring 012 on the
 * write side. The RPC is idempotent: a missing row (already undone) returns
 * success instead of erroring.
 */
export async function undoCompletion(
  userId: string,
  habitId: string,
  stat: Stat,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[],
  timeZone: string = deviceTimeZone(),
  completedOn?: string
): Promise<void> {
  // userId/stat remain in the signature for API stability; the RPC resolves
  // both server-side so client and DB can't disagree.
  void userId;
  void stat;

  await invokeTrackerWrite<unknown>('undo_habit_completion', {
    p_habit_id: habitId,
    p_completed_on: completedOn ?? todayKey(timeZone),
  }, expected, targets);
}

/**
 * Slice 5: atomically adjust a quantity habit's today progress by `delta`,
 * clamped to [0, target_count] server-side, auto-crossing complete_habit/
 * undo_habit_completion when progress crosses the target (see
 * increment_habit_progress, 019_habit_progress.sql). Returns the
 * server-computed new count — the authoritative value once the RPC's row
 * lock resolves; overlapping in-flight calls from rapid tapping mean
 * whichever response lands last should win, not whichever request was
 * issued last.
 */
export async function incrementHabitProgress(
  habitId: string,
  date: string,
  delta: number,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[]
): Promise<number> {
  const count = await invokeTrackerWrite<unknown>('increment_habit_progress', {
    p_habit_id: habitId,
    p_date: date,
    p_delta: delta,
  }, expected, targets);
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Unexpected progress result');
  return count;
}
