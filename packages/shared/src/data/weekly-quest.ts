import { accountDateKey, addDateKeyDays, mondayDateKey } from '../logic/date-utils';
import { weakestStat } from '../logic/eiyu-logic';
import { supabase } from '../supabase/client';
import { Stat, StatData } from '../types/eiyu';
import { fetchHistoryEvidence } from './history';

// Roughly one completion every weekday — simple, defensible, and avoids
// tying the target to each habit's schedule (Could-priority feature, not
// worth the complexity of intersecting schedules across habits per stat).
const DEFAULT_TARGET = 5;

export interface WeeklyQuest {
  weekStart: string;
  stat: Stat;
  targetCount: number;
  currentCount: number;
}

/**
 * R-30: fetches this week's Weekly Quest, auto-generating one (targeting the
 * weakest stat, R-30) the first time it's read in a given week — there's no
 * background job, so "auto" means "created lazily on next read," consistent
 * with how streak freeze/recovery is computed on read elsewhere.
 */
export async function fetchOrCreateWeeklyQuest(
  userId: string,
  stats: Record<Stat, StatData>,
  timeZone: string,
  now: Date = new Date()
): Promise<WeeklyQuest> {
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));
  const weekEnd = addDateKeyDays(weekStart, 7);

  const { data: existing, error: fetchError } = await supabase
    .from('weekly_quests')
    .select('stat, target_count')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (fetchError) throw fetchError;

  let stat: Stat;
  let targetCount: number;

  if (existing) {
    stat = existing.stat;
    targetCount = existing.target_count;
  } else {
    stat = weakestStat(stats);
    targetCount = DEFAULT_TARGET;
    const { error: insertError } = await supabase.from('weekly_quests').insert({
      user_id: userId,
      week_start: weekStart,
      stat,
      target_count: targetCount,
    });
    // Unique constraint on (user_id, week_start): a second tab racing to
    // create the same week's quest loses the insert, not the read — just
    // fall through and trust whatever won.
    if (insertError && insertError.code !== '23505') throw insertError;
    if (insertError) {
      const { data: winner, error: refetchError } = await supabase
        .from('weekly_quests')
        .select('stat, target_count')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .single();
      if (refetchError) throw refetchError;
      stat = winner.stat;
      targetCount = winner.target_count;
    }
  }

  // Weekly Quest counts recurring completions only; the database computes this
  // exact total from the same snapshot used by every historical reader.
  const snapshot = await fetchHistoryEvidence(weekStart, weekEnd);
  const currentCount = snapshot.recurring_totals[stat] ?? 0;
  return { weekStart, stat, targetCount, currentCount };
}
