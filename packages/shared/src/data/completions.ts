import { supabase } from '../supabase/client';
import { CompletionKind } from '../types/database';
import { Stat } from '../types/eiyu';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * R-05/R-06: record a completion and award XP (R-21) ATOMICALLY via the
 * complete_habit RPC (migration 012, XP made server-side in 014). Previously
 * this was an insert followed by a separate increment_stat_xp call - two
 * network round-trips where a crash between them desynced history vs stats.
 * `completedOn` defaults to today; the recovery-quest flow (R-13) backdates
 * it to the missed date so completing it retroactively fills that gap.
 */
export async function completeHabit(
  userId: string,
  habitId: string,
  stat: Stat,
  kind: CompletionKind,
  completedOn: string = todayKey()
) {
  // userId/stat stay in the signature for API stability; both are resolved
  // server-side by the RPC (auth.uid(), habit lookup) so client and DB can't
  // disagree — as of migration 014, so is the XP amount (see 014's comment).
  void userId;
  void stat;

  const { error } = await supabase.rpc('complete_habit', {
    p_habit_id: habitId,
    p_completed_on: completedOn,
    p_kind: kind,
  });
  if (error) throw error;
}

/**
 * R-07: undo today's completion and reverse the XP it awarded — ATOMICALLY
 * via the undo_habit_completion RPC (migration 013), mirroring 012 on the
 * write side. The RPC is idempotent: a missing row (already undone) returns
 * success instead of erroring.
 */
export async function undoCompletion(userId: string, habitId: string, stat: Stat) {
  // userId/stat remain in the signature for API stability; the RPC resolves
  // both server-side so client and DB can't disagree.
  void userId;
  void stat;

  const { error } = await supabase.rpc('undo_habit_completion', {
    p_habit_id: habitId,
    p_completed_on: todayKey(),
  });
  if (error) throw error;
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
export async function incrementHabitProgress(habitId: string, date: string, delta: number): Promise<number> {
  const { data, error } = await supabase.rpc('increment_habit_progress', {
    p_habit_id: habitId,
    p_date: date,
    p_delta: delta,
  });
  if (error) throw error;
  return data as number;
}
