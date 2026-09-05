import { addUtcDays, toDateKey } from '../logic/date-utils';
import { supabase } from '../supabase/client';
import { CompletionKind } from '../types/database';

export interface HistoryCompletion {
  habitName: string;
  kind: CompletionKind;
}

/**
 * Per-date detail for the history calendar and the Slice 6 heatmap.
 * `completions` is unfiltered — every habit actually completed that day,
 * including ones since archived (matches the pre-Slice-6 tooltip behavior).
 * `completedCount`/`scheduledCount` are the heatmap ratio's numerator/
 * denominator, both recomputed against the CURRENT (non-archived, recurring)
 * habit set for every date — see the design doc's "no historical schema"
 * trade-off. completedCount only counts completions whose habit is in that
 * same current-schedule set, so the ratio never exceeds 1.
 */
export interface DayHistory {
  completions: HistoryCompletion[];
  completedCount: number;
  scheduledCount: number;
}

export type HistoryByDate = Record<string, DayHistory>;

/** Completions + heatmap ratio for a given UTC month, grouped by date key (R-08, Slice 6). */
export async function fetchMonthHistory(userId: string, year: number, month: number): Promise<HistoryByDate> {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const startStr = toDateKey(start);
  const endStr = toDateKey(end);

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, name, quest_type, days, archived')
    .eq('user_id', userId);
  if (habitsError) throw habitsError;

  const nameByHabit = new Map((habits ?? []).map(h => [h.id, h.name]));
  // Only recurring habits use day-of-week scheduling — one_time rows carry a
  // meaningless default `days` and are scheduled by scheduled_date instead
  // (see quest-recurrence.ts's todayQuestsFilter, which this reproduces the
  // day-mask half of).
  const scheduledHabits = (habits ?? []).filter(h => h.quest_type === 'habit' && !h.archived);

  const { data: completions, error } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_on, kind')
    .eq('user_id', userId)
    .gte('completed_on', startStr)
    .lt('completed_on', endStr);
  if (error) throw error;

  const completionsByDate = new Map<string, { habit_id: string; kind: CompletionKind }[]>();
  for (const c of completions ?? []) {
    if (!completionsByDate.has(c.completed_on)) completionsByDate.set(c.completed_on, []);
    completionsByDate.get(c.completed_on)!.push({ habit_id: c.habit_id, kind: c.kind });
  }

  const result: HistoryByDate = {};
  for (let d = start; d < end; d = addUtcDays(d, 1)) {
    const dateKey = toDateKey(d);
    const weekday = d.getUTCDay();
    const scheduledIds = new Set(scheduledHabits.filter(h => h.days.includes(weekday)).map(h => h.id));
    const dayCompletions = completionsByDate.get(dateKey) ?? [];

    const completionDetails: HistoryCompletion[] = [];
    for (const c of dayCompletions) {
      const name = nameByHabit.get(c.habit_id);
      if (name) completionDetails.push({ habitName: name, kind: c.kind });
    }

    result[dateKey] = {
      completions: completionDetails,
      completedCount: dayCompletions.filter(c => scheduledIds.has(c.habit_id)).length,
      scheduledCount: scheduledIds.size,
    };
  }
  return result;
}
