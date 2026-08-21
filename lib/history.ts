import { toDateKey } from '@/lib/date-utils';
import { supabase } from '@/lib/supabase';
import { CompletionKind } from '@/types/database';

export interface HistoryCompletion {
  habitName: string;
  kind: CompletionKind;
}

export type HistoryByDate = Record<string, HistoryCompletion[]>;

/** Completions for a given UTC month, grouped by date key, for the history calendar (R-08). */
export async function fetchMonthHistory(userId: string, year: number, month: number): Promise<HistoryByDate> {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const startStr = toDateKey(start);
  const endStr = toDateKey(end);

  const { data: habits, error: habitsError } = await supabase.from('habits').select('id, name').eq('user_id', userId);
  if (habitsError) throw habitsError;
  const nameByHabit = new Map((habits ?? []).map(h => [h.id, h.name]));

  const { data: completions, error } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_on, kind')
    .eq('user_id', userId)
    .gte('completed_on', startStr)
    .lt('completed_on', endStr);
  if (error) throw error;

  const result: HistoryByDate = {};
  for (const c of completions ?? []) {
    const name = nameByHabit.get(c.habit_id);
    if (!name) continue;
    (result[c.completed_on] ??= []).push({ habitName: name, kind: c.kind });
  }
  return result;
}
