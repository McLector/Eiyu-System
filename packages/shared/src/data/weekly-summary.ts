import { generateWeeklySummary, WeeklySummaryHabitDatum } from '../ai/suggestions';
import { supabase } from '../supabase/client';
import { STATS } from '../constants/eiyu-data';
import { accountDateKey, addDateKeyDays, mondayDateKey } from '../logic/date-utils';
import { Stat } from '../types/eiyu';
import { fetchHistoryEvidence } from './history';

export async function gatherWeekData(
  userId: string,
  weekStart: string,
  weekEndExclusive: string
): Promise<{ habits: WeeklySummaryHabitDatum[]; statTotals: Record<Stat, number> }> {
  const snapshot = await fetchHistoryEvidence(weekStart, weekEndExclusive);
  const countsByHabit = new Map<string, WeeklySummaryHabitDatum>();
  for (const habit of snapshot.habits) {
    countsByHabit.set(habit.id, { name: habit.name, stat: habit.stat, fullCount: 0, easyCount: 0 });
  }
  for (const row of snapshot.rows) {
    if (!row.completion_kind) continue;
    let datum = countsByHabit.get(row.source_habit_id);
    if (!datum) {
      datum = { name: row.habit_name, stat: row.stat, fullCount: 0, easyCount: 0 };
      countsByHabit.set(row.source_habit_id, datum);
    }
    if (row.completion_kind === 'full') datum.fullCount += 1;
    else datum.easyCount += 1;
  }
  const habits = Array.from(countsByHabit.values());
  const statTotals = STATS.reduce((acc, stat) => ({ ...acc, [stat]: 0 }), {} as Record<Stat, number>);
  for (const habit of habits) statTotals[habit.stat] += habit.fullCount + habit.easyCount;
  return { habits, statTotals };
}
/**
 * R-60: fetches this week's AI summary paragraph, generating one (from the
 * week-to-date's completion data) the first time it's read in a given week -
 * cached in weekly_summaries so the paragraph is stable and isn't
 * regenerated on every Status screen visit.
 */
export async function fetchOrCreateWeeklySummary(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<string> {
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));
  const weekEnd = addDateKeyDays(weekStart, 7);

  const { data: existing, error: fetchError } = await supabase
    .from('weekly_summaries')
    .select('summary')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing.summary;

  const { habits, statTotals } = await gatherWeekData(userId, weekStart, weekEnd);
  const summary = await generateWeeklySummary(weekStart, habits, statTotals);

  const { error: insertError } = await supabase
    .from('weekly_summaries')
    .insert({ user_id: userId, week_start: weekStart, summary });
  // Unique constraint on (user_id, week_start): a second tab racing to
  // generate the same week's summary loses the insert, not the read - just
  // trust whatever won rather than showing two different paragraphs.
  if (insertError && insertError.code !== '23505') throw insertError;
  if (insertError) {
    const { data: winner, error: refetchError } = await supabase
      .from('weekly_summaries')
      .select('summary')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .single();
    if (refetchError) throw refetchError;
    return winner.summary;
  }

  return summary;
}

/**
 * Slice 2.1: user-triggered regeneration, capped server-side at 2/day.
 * Reserves a regen slot via the atomic RPC BEFORE calling the AI proxy, so a
 * rejected reservation (cap already spent) never burns a Gemini call. Only
 * writes the new summary back once both the reservation and the generation
 * succeed.
 */
export async function regenerateWeeklySummary(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<string> {
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));
  const weekEnd = addDateKeyDays(weekStart, 7);

  const { error: reserveError } = await supabase.rpc('reserve_weekly_summary_regen', {
    p_week_start: weekStart,
  });
  if (reserveError) throw reserveError;

  const { habits, statTotals } = await gatherWeekData(userId, weekStart, weekEnd);
  const summary = await generateWeeklySummary(weekStart, habits, statTotals);

  const { error: updateError } = await supabase
    .from('weekly_summaries')
    .update({ summary })
    .eq('user_id', userId)
    .eq('week_start', weekStart);
  if (updateError) throw updateError;

  return summary;
}
