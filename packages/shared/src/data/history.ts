import { addDateKeyDays, addUtcDays, toDateKey } from '../logic/date-utils';
import { supabase } from '../supabase/client';
import { CompletionKind } from '../types/database';
import { initializeAccountTimeZone } from './profile';

export interface HistoryCompletion {
  habitName: string;
  kind: CompletionKind;
}

/**
 * Per-date detail for the history calendar and the Slice 6 heatmap.
 * `completions` is unfiltered — every habit actually completed that day,
 * including ones since archived (matches the pre-Slice-6 tooltip behavior).
 * `completedCount`/`scheduledCount` use immutable recurring-habit occurrence
 * rows, so schedule edits and later archiving cannot rewrite historical days.
 */
export interface DayHistory {
  completions: HistoryCompletion[];
  completedCount: number;
  scheduledCount: number;
}

export type HistoryByDate = Record<string, DayHistory>;

/** Completions + heatmap ratio for every day in `[startDate, endDate)`, grouped by date key. */
export async function fetchHistoryRange(userId: string, startDate: Date, endDate: Date): Promise<HistoryByDate> {
  const startStr = toDateKey(startDate);
  const endStr = toDateKey(endDate);
  await initializeAccountTimeZone();
  const { error: ensureError } = await supabase.rpc('ensure_habit_occurrences', {
    p_through_date: addDateKeyDays(endStr, -1),
  });
  if (ensureError) throw ensureError;

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, name, quest_type')
    .eq('user_id', userId);
  if (habitsError) throw habitsError;

  const nameByHabit = new Map((habits ?? []).map(h => [h.id, h.name]));
  const recurringHabitIds = new Set((habits ?? []).filter(h => h.quest_type === 'habit').map(h => h.id));

  const { data: occurrences, error: occurrencesError } = await supabase
    .from('habit_occurrences')
    .select('habit_id, occurrence_date')
    .eq('user_id', userId)
    .gte('occurrence_date', startStr)
    .lt('occurrence_date', endStr);
  if (occurrencesError) throw occurrencesError;
  const scheduledByDate = new Map<string, Set<string>>();
  for (const occurrence of occurrences ?? []) {
    if (!recurringHabitIds.has(occurrence.habit_id)) continue;
    if (!scheduledByDate.has(occurrence.occurrence_date)) {
      scheduledByDate.set(occurrence.occurrence_date, new Set());
    }
    scheduledByDate.get(occurrence.occurrence_date)!.add(occurrence.habit_id);
  }

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
  for (let d = startDate; d < endDate; d = addUtcDays(d, 1)) {
    const dateKey = toDateKey(d);
    const scheduledIds = scheduledByDate.get(dateKey) ?? new Set<string>();
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

/** Completions + heatmap ratio for a calendar month, grouped by canonical date key. */
export function fetchMonthHistory(userId: string, year: number, month: number): Promise<HistoryByDate> {
  return fetchHistoryRange(userId, new Date(Date.UTC(year, month, 1)), new Date(Date.UTC(year, month + 1, 1)));
}
