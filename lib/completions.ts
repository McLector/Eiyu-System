import { EASY_XP, FULL_XP } from '@/lib/eiyu-logic';
import { supabase } from '@/lib/supabase';
import { CompletionKind } from '@/types/database';
import { Stat } from '@/types/eiyu';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * R-05/R-06: record a completion and award XP (R-21) atomically via RPC.
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
  const xp = kind === 'full' ? FULL_XP : EASY_XP;

  const { error } = await supabase.from('habit_completions').insert({
    user_id: userId,
    habit_id: habitId,
    completed_on: completedOn,
    kind,
    xp_awarded: xp,
  });
  if (error) throw error;

  const { error: rpcError } = await supabase.rpc('increment_stat_xp', { p_stat: stat, p_delta: xp });
  if (rpcError) throw rpcError;
}

/** R-07: undo today's completion and reverse the XP it awarded. */
export async function undoCompletion(userId: string, habitId: string, stat: Stat) {
  const { data, error: fetchError } = await supabase
    .from('habit_completions')
    .select('id, xp_awarded')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('completed_on', todayKey())
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!data) return;

  const { error: deleteError } = await supabase.from('habit_completions').delete().eq('id', data.id);
  if (deleteError) throw deleteError;

  const { error: rpcError } = await supabase.rpc('increment_stat_xp', {
    p_stat: stat,
    p_delta: -data.xp_awarded,
  });
  if (rpcError) throw rpcError;
}
