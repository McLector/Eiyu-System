import { accountDateKey, addDateKeyDays, mondayDateKey } from '../logic/date-utils';
import { supabase } from '../supabase/client';
import { Stat } from '../types/eiyu';
import { fetchHistoryEvidence } from './history';

export interface WeeklyQuest {
  weekStart: string;
  stat: Stat;
  targetCount: number;
  currentCount: number;
}

/**
 * R-30: reads this week's Weekly Quest. It never creates one: creation happens inside the permission-aware
 * `prepareDay` step, so a read can never write. Returns null when the week has not been prepared yet.
 */
export async function fetchWeeklyQuest(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<WeeklyQuest | null> {
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));
  const weekEnd = addDateKeyDays(weekStart, 7);

  const { data: existing, error } = await supabase
    .from('weekly_quests')
    .select('stat, target_count')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return null;

  // Weekly Quest counts recurring completions only; the database computes this
  // exact total from the same snapshot used by every historical reader.
  const snapshot = await fetchHistoryEvidence(weekStart, weekEnd);
  const stat: Stat = existing.stat;
  return { weekStart, stat, targetCount: existing.target_count, currentCount: snapshot.recurring_totals[stat] ?? 0 };
}
