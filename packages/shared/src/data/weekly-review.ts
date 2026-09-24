import { STATS } from '../constants/eiyu-data';
import { accountDateKey, addDateKeyDays, weekdayForDateKey } from '../logic/date-utils';
import { supabase } from '../supabase/client';
import { Stat } from '../types/eiyu';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type WeeklyDayDatum = { dateKey: string; day: string } & Record<Stat, number>;

function emptyDayCounts(): Record<Stat, number> {
  return { STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 0 };
}

/** Completions per stat per day for the last 7 days (today inclusive), for the Weekly Review tab. */
export async function fetchWeeklyReview(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<WeeklyDayDatum[]> {
  const todayKey = accountDateKey(now, timeZone);
  const startStr = addDateKeyDays(todayKey, -6);

  // includes archived habits: past completions still happened, even for
  // habits the user has since archived.
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, stat')
    .eq('user_id', userId);
  if (habitsError) throw habitsError;
  const statByHabit = new Map((habits ?? []).map(h => [h.id, h.stat]));

  const [{ data: completions, error }, { data: deletedHistory, error: deletedHistoryError }] = await Promise.all([
    supabase
      .from('habit_completions')
      .select('habit_id, completed_on')
      .eq('user_id', userId)
      .gte('completed_on', startStr)
      .lte('completed_on', todayKey),
    supabase
      .from('deleted_habit_history')
      .select('source_habit_id, historical_date, stat, completion_kind')
      .eq('user_id', userId)
      .gte('historical_date', startStr)
      .lte('historical_date', todayKey),
  ]);
  if (error) throw error;
  if (deletedHistoryError) throw deletedHistoryError;

  const buckets = new Map<string, Record<Stat, number>>();
  for (let i = 0; i < 7; i++) {
    buckets.set(addDateKeyDays(startStr, i), emptyDayCounts());
  }

  for (const c of completions ?? []) {
    const stat = statByHabit.get(c.habit_id);
    const bucket = buckets.get(c.completed_on);
    if (!stat || !bucket) continue;
    bucket[stat] += 1;
  }
  for (const row of deletedHistory ?? []) {
    if (!row.completion_kind) continue;
    const bucket = buckets.get(row.historical_date);
    if (!bucket) continue;
    bucket[row.stat] += 1;
  }

  return Array.from(buckets.entries()).map(([dateKey, counts]) => ({
    dateKey,
    day: DAY_LABELS[weekdayForDateKey(dateKey)],
    ...counts,
  }));
}

export function weeklyStatTotal(data: WeeklyDayDatum[], stat: Stat): number {
  return data.reduce((sum, d) => sum + d[stat], 0);
}

export function weeklyDayTotal(day: WeeklyDayDatum): number {
  return STATS.reduce((sum, stat) => sum + day[stat], 0);
}
