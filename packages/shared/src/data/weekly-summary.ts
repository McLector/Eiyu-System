import { generateWeeklySummary, WeeklySummaryHabitDatum } from '../ai/suggestions';
import { supabase } from '../supabase/client';
import { STATS } from '../constants/eiyu-data';
import { addUtcDays, mondayOfWeek, toDateKey } from '../logic/date-utils';
import { Stat } from '../types/eiyu';

async function gatherWeekData(
  userId: string,
  weekStart: string,
  weekEndExclusive: string
): Promise<{ habits: WeeklySummaryHabitDatum[]; statTotals: Record<Stat, number> }> {
  // Both reads are user-scoped and independent, so they go out together
  // rather than one waiting on the other. The completions query used to
  // filter `.in('habit_id', habits.map(...))`, which forced that wait for
  // nothing: archived habits' completions are already dropped downstream
  // (counts are only ever read back through the non-archived habit list).
  const [
    { data: habits, error: habitsError },
    { data: completions, error: completionsError },
  ] = await Promise.all([
    supabase.from('habits').select('id, name, stat').eq('user_id', userId).eq('archived', false),
    supabase
      .from('habit_completions')
      .select('habit_id, kind')
      .eq('user_id', userId)
      .gte('completed_on', weekStart)
      .lt('completed_on', weekEndExclusive),
  ]);
  if (habitsError) throw habitsError;
  if (completionsError) throw completionsError;

  const countsByHabit = new Map<string, { full: number; easy: number }>();
  for (const c of completions ?? []) {
    if (!countsByHabit.has(c.habit_id)) countsByHabit.set(c.habit_id, { full: 0, easy: 0 });
    const bucket = countsByHabit.get(c.habit_id)!;
    if (c.kind === 'full') bucket.full += 1;
    else bucket.easy += 1;
  }

  const statTotals = STATS.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<Stat, number>);
  const habitData: WeeklySummaryHabitDatum[] = (habits ?? []).map(h => {
    const counts = countsByHabit.get(h.id) ?? { full: 0, easy: 0 };
    statTotals[h.stat] += counts.full + counts.easy;
    return { name: h.name, stat: h.stat, fullCount: counts.full, easyCount: counts.easy };
  });

  return { habits: habitData, statTotals };
}

/**
 * R-60: fetches this week's AI summary paragraph, generating one (from the
 * week-to-date's completion data) the first time it's read in a given week -
 * cached in weekly_summaries so the paragraph is stable and isn't
 * regenerated on every Status screen visit.
 */
export async function fetchOrCreateWeeklySummary(userId: string, now: Date = new Date()): Promise<string> {
  const weekStartDate = mondayOfWeek(now);
  const weekStart = toDateKey(weekStartDate);
  const weekEnd = toDateKey(addUtcDays(weekStartDate, 7));

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
