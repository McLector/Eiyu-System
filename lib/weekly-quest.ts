import { addUtcDays, mondayOfWeek, toDateKey } from '@/lib/date-utils';
import { weakestStat } from '@/lib/eiyu-logic';
import { supabase } from '@/lib/supabase';
import { Stat, StatData } from '@/types/eiyu';

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

async function countCompletionsForStatThisWeek(
  userId: string,
  stat: Stat,
  weekStart: string,
  weekEnd: string
): Promise<number> {
  // Decision (Phase 4 review): one-time quests are EXCLUDED from the weekly
  // count. The target was calibrated around habit cadence ("roughly one
  // completion per weekday"); letting a burst of same-day todos blow through
  // it would trivialize the weekly loop. XP still counts fully — this only
  // affects progress toward the auto-generated Weekly Quest.
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('stat', stat)
    .neq('quest_type', 'one_time');
  if (habitsError) throw habitsError;
  const habitIds = (habits ?? []).map(h => h.id);
  if (habitIds.length === 0) return 0;

  const { count, error } = await supabase
    .from('habit_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('habit_id', habitIds)
    .gte('completed_on', weekStart)
    .lt('completed_on', weekEnd);
  if (error) throw error;
  return count ?? 0;
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
  now: Date = new Date()
): Promise<WeeklyQuest> {
  const weekStartDate = mondayOfWeek(now);
  const weekStart = toDateKey(weekStartDate);
  const weekEnd = toDateKey(addUtcDays(weekStartDate, 7));

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

  const currentCount = await countCompletionsForStatThisWeek(userId, stat, weekStart, weekEnd);
  return { weekStart, stat, targetCount, currentCount };
}
