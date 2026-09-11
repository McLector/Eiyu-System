import { accountDateKey } from '../logic/date-utils';
import { streakStateFromOccurrences } from '../logic/eiyu-logic';
import { supabase } from '../supabase/client';
import { Database } from '../types/database';
import { Difficulty, Quest, QuestType, Stat } from '../types/eiyu';
import { initializeAccountTimeZone } from './profile';

type HabitRow = Database['public']['Tables']['habits']['Row'];
type RecoveryRow = Database['public']['Functions']['get_open_habit_recoveries']['Returns'][number];

function toQuest(
  row: HabitRow,
  completedToday: boolean,
  completedDates: Set<string>,
  occurrenceDates: Set<string>,
  now: Date,
  progressCount: number,
  timeZone: string,
  dailyEligible: boolean,
  recovery?: RecoveryRow
): Quest {
  // One-time quests have no streak/freeze mechanics (binary done/not-done) —
  // skip the streak computation entirely so a missed day can never freeze one.
  const state =
    recovery || row.quest_type === 'one_time'
      ? undefined
      : streakStateFromOccurrences(
          occurrenceDates,
          completedDates,
          now,
          timeZone
        );
  return {
    id: row.id,
    name: row.name,
    stat: row.stat,
    difficulty: row.difficulty,
    easyVersion: row.easy_version,
    description: row.description,
    questType: row.quest_type,
    time: row.reminder_time.slice(0, 5),
    days: row.days,
    streak: recovery?.preserved_streak ?? state?.current ?? 0,
    frozen: Boolean(recovery) || state?.state === 'frozen',
    frozenHoursLeft: recovery
      ? Math.max(0, Math.ceil((Date.parse(recovery.deadline_at) - now.getTime()) / 3_600_000))
      : state?.frozenHoursLeft,
    frozenDate: recovery?.missed_on ?? state?.frozenDate,
    dailyEligible,
    recoveryDeadline: recovery?.deadline_at,
    recoveryTimeZone: recovery?.time_zone,
    completed: completedToday,
    targetCount: row.target_count,
    progressCount: row.target_count != null ? progressCount : 0,
  };
}

/**
 * Habits scheduled for today, sorted by reminder time, with today's completion
 * state and streak (R-10). The authoritative RPC returns recurring habits
 * only when an immutable occurrence exists for the account-local date, plus
 * one-time quests whose scheduled date is that same canonical date.
 */
export async function fetchTodayHabits(userId: string): Promise<Quest[]> {
  const today = new Date();
  const timeZone = await initializeAccountTimeZone();
  const todayStr = accountDateKey(today, timeZone);

  // The RPC materializes unique eligible occurrences and returns only habits
  // joined to today's occurrence. Mobile and web therefore share the exact
  // same authoritative schedule result, including after schedule edits.
  const { data: habits, error } = await supabase.rpc('get_habits_for_date', {
    p_date: todayStr,
  });
  if (error) throw error;

  const { data: recoveries, error: recoveriesError } = await supabase.rpc(
    'get_open_habit_recoveries',
    {}
  );
  if (recoveriesError) throw recoveriesError;

  const dailyHabits = habits ?? [];
  const openRecoveries = recoveries ?? [];
  const dailyIds = new Set(dailyHabits.map(habit => habit.id));
  const recoveryOnlyIds = openRecoveries
    .map(recovery => recovery.habit_id)
    .filter(habitId => !dailyIds.has(habitId));

  let recoveryOnlyHabits: HabitRow[] = [];
  if (recoveryOnlyIds.length > 0) {
    const { data, error: recoveryHabitsError } = await supabase
      .from('habits')
      .select('*')
      .in('id', recoveryOnlyIds);
    if (recoveryHabitsError) throw recoveryHabitsError;
    recoveryOnlyHabits = data ?? [];
  }

  const allHabits = [...dailyHabits, ...recoveryOnlyHabits];
  if (allHabits.length === 0) return [];
  const allHabitIds = allHabits.map(habit => habit.id);
  const recoveryByHabit = new Map(openRecoveries.map(recovery => [recovery.habit_id, recovery]));

  const { data: completions, error: completionsError } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_on')
    .eq('user_id', userId)
    .in(
      'habit_id',
      allHabitIds
    );
  if (completionsError) throw completionsError;

  const completedToday = new Set<string>();
  const datesByHabit = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    if (c.completed_on === todayStr) completedToday.add(c.habit_id);
    if (!datesByHabit.has(c.habit_id)) datesByHabit.set(c.habit_id, new Set());
    datesByHabit.get(c.habit_id)!.add(c.completed_on);
  }

  const { data: occurrences, error: occurrencesError } = await supabase
    .from('habit_occurrences')
    .select('habit_id, occurrence_date')
    .eq('user_id', userId)
    .in(
      'habit_id',
      allHabitIds
    )
    .lte('occurrence_date', todayStr);
  if (occurrencesError) throw occurrencesError;
  const occurrencesByHabit = new Map<string, Set<string>>();
  for (const occurrence of occurrences ?? []) {
    if (!occurrencesByHabit.has(occurrence.habit_id)) {
      occurrencesByHabit.set(occurrence.habit_id, new Set());
    }
    occurrencesByHabit.get(occurrence.habit_id)!.add(occurrence.occurrence_date);
  }

  // Slice 5: today's running count for any quantity habit in this batch.
  const { data: progress, error: progressError } = await supabase
    .from('habit_progress')
    .select('habit_id, progress_count')
    .eq('user_id', userId)
    .eq('progress_date', todayStr)
    .in(
      'habit_id',
      allHabitIds
    );
  if (progressError) throw progressError;
  const progressByHabit = new Map<string, number>();
  for (const p of progress ?? []) progressByHabit.set(p.habit_id, p.progress_count);

  return allHabits.map(h =>
    toQuest(
      h,
      completedToday.has(h.id),
      datesByHabit.get(h.id) ?? new Set(),
      occurrencesByHabit.get(h.id) ?? new Set(),
      today,
      progressByHabit.get(h.id) ?? 0,
      timeZone,
      dailyIds.has(h.id),
      recoveryByHabit.get(h.id)
    )
  );
}

export interface HabitInput {
  name: string;
  /** One-time quests have no easy/recovery version — leave null (011_quest_types.sql). */
  easyVersion?: string | null;
  stat: Stat;
  difficulty: Difficulty;
  time: string;
  days: number[];
  questType?: QuestType;
  /** Optional note attached to the quest. */
  description?: string | null;
  /** One-time quests only; "YYYY-MM-DD" local calendar date. Ignored/null for recurring habits (Slice 4). */
  scheduledDate?: string | null;
  /** Quantity-habit target (>1); habit-type only, ignored/null for one-time (Slice 5). */
  targetCount?: number | null;
}

/** Shared insert/update column mapping so both write paths stay in lockstep. */
function habitColumns(input: HabitInput) {
  return {
    name: input.name,
    easy_version:
      input.questType === 'one_time' ? null : input.easyVersion?.trim() ? input.easyVersion.trim() : null,
    description: input.description?.trim() ? input.description.trim() : null,
    quest_type: input.questType ?? ('habit' as QuestType),
    stat: input.stat,
    difficulty: input.difficulty,
    reminder_time: input.time,
    days: input.days,
    scheduled_date: input.questType === 'one_time' ? (input.scheduledDate ?? null) : null,
    target_count: input.questType === 'one_time' ? null : (input.targetCount ?? null),
  };
}

export async function createHabit(userId: string, input: HabitInput): Promise<string> {
  await initializeAccountTimeZone();
  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id: userId, ...habitColumns(input) })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export interface ActiveHabitReminder {
  id: string;
  name: string;
  time: string;
  days: number[];
}

/**
 * All non-archived RECURRING habits regardless of today's schedule — for
 * (re)scheduling local reminders (R-40). One-time quests are excluded on
 * purpose: their reminders are one-shots arranged at creation time, and
 * letting the reminder resync see them would revert that back into a
 * recurring pattern every time the toggle flips.
 */
export async function fetchAllActiveHabits(userId: string): Promise<ActiveHabitReminder[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, reminder_time, days')
    .eq('user_id', userId)
    .eq('archived', false)
    .neq('quest_type', 'one_time');
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), days: h.days }));
}

/**
 * One-time quests scheduled for the current account-local date — for re-arming their one-shot
 * reminders after cancelAllHabitReminders wipes the shared id map
 * (notifications toggle off/on). scheduled_date is the source of truth
 * (Slice 4) — a quest scheduled for a future day is correctly excluded
 * here; its reminder gets armed on its own scheduled day instead, when
 * this function next runs against that day's "today".
 */
export async function fetchTodayOneTimeHabits(
  userId: string
): Promise<{ id: string; name: string; time: string }[]> {
  const today = new Date();
  const timeZone = await initializeAccountTimeZone();
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, reminder_time')
    .eq('user_id', userId)
    .eq('archived', false)
    .eq('quest_type', 'one_time')
    .eq('scheduled_date', accountDateKey(today, timeZone));
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5) }));
}

export async function updateHabit(id: string, input: HabitInput) {
  await initializeAccountTimeZone();
  const { error } = await supabase.from('habits').update(habitColumns(input)).eq('id', id);
  if (error) throw error;
}

/** R-03: "archive" not hard-delete, so history/completions stay intact. */
export async function archiveHabit(id: string) {
  const { error } = await supabase.from('habits').update({ archived: true }).eq('id', id);
  if (error) throw error;
}
