import { EASY_XP, FULL_XP } from '@/lib/eiyu-logic';
import { supabase } from '@/lib/supabase';
import { CompletionKind } from '@/types/database';
import { Stat } from '@/types/eiyu';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * R-05/R-06: record a completion and award XP (R-21) ATOMICALLY via the
 * complete_habit RPC (migration 012). Previously this was an insert followed
 * by a separate increment_stat_xp call - two network round-trips where a
 * crash between them desynced history vs stats.
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
  // userId stays in the signature for API stability; like stat, it's resolved
  // server-side by the RPC (auth.uid()) so client and DB can't disagree.
  void userId;
  void stat;
  const xp = kind === 'full' ? FULL_XP : EASY_XP;

  const { error } = await supabase.rpc('complete_habit', {
    p_habit_id: habitId,
    p_completed_on: completedOn,
    p_kind: kind,
    p_xp: xp,
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
