import { addUtcDays, toDateKey } from '../logic/date-utils';
import { streakState } from '../logic/eiyu-logic';
import { todayQuestsFilter } from '../logic/quest-recurrence';
import { supabase } from '../supabase/client';
import { Database } from '../types/database';
import { Difficulty, Quest, QuestType, Stat } from '../types/eiyu';

type HabitRow = Database['public']['Tables']['habits']['Row'];

function toQuest(
  row: HabitRow,
  completedToday: boolean,
  completedDates: Set<string>,
  now: Date,
  progressCount: number
): Quest {
  // One-time quests have no streak/freeze mechanics (binary done/not-done) —
  // skip the streak computation entirely so a missed day can never freeze one.
  const state =
    row.quest_type === 'one_time'
      ? undefined
      : streakState(row.days, completedDates, now, new Date(row.created_at));
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
    streak: state?.current ?? 0,
    frozen: state?.state === 'frozen',
    frozenHoursLeft: state?.frozenHoursLeft,
    frozenDate: state?.frozenDate,
    completed: completedToday,
    targetCount: row.target_count,
    progressCount: row.target_count != null ? progressCount : 0,
  };
}

/**
 * Habits scheduled for today, sorted by reminder time, with today's completion
 * state and streak (R-10). Recurring habits match by day-of-week; ONE-TIME
 * quests appear only on their creation day (UTC date key, consistent with the
 * rest of the app's UTC-day math). That explicit created_at window is the
 * recurrence guard — without it, a one-time row carrying the default
 * days = [0..6] would reappear every single day.
 */
export async function fetchTodayHabits(userId: string): Promise<Quest[]> {
  const today = new Date();
  // UTC throughout to stay consistent with completed_on (an ISO date string)
  // and streakState's day-of-week math — mixing local getDay() with UTC date
  // keys silently shifts the day for users outside UTC.
  const todayStr = toDateKey(today);

  const { data: habits, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .or(todayQuestsFilter(today))
    .order('reminder_time', { ascending: true });
  if (error) throw error;
  if (!habits || habits.length === 0) return [];

  // 90 days is comfortably more than any realistic streak needs for display.
  const sinceStr = toDateKey(addUtcDays(today, -90));

  const { data: completions, error: completionsError } = await supabase
    .from('habit_completions')
    .select('habit_id, completed_on')
    .eq('user_id', userId)
    .in(
      'habit_id',
      habits.map(h => h.id)
    )
    .gte('completed_on', sinceStr);
  if (completionsError) throw completionsError;

  const completedToday = new Set<string>();
  const datesByHabit = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    if (c.completed_on === todayStr) completedToday.add(c.habit_id);
    if (!datesByHabit.has(c.habit_id)) datesByHabit.set(c.habit_id, new Set());
    datesByHabit.get(c.habit_id)!.add(c.completed_on);
  }

  // Slice 5: today's running count for any quantity habit in this batch.
  const { data: progress, error: progressError } = await supabase
    .from('habit_progress')
    .select('habit_id, progress_count')
    .eq('user_id', userId)
    .eq('progress_date', todayStr)
    .in(
      'habit_id',
      habits.map(h => h.id)
    );
  if (progressError) throw progressError;
  const progressByHabit = new Map<string, number>();
  for (const p of progress ?? []) progressByHabit.set(p.habit_id, p.progress_count);

  return habits.map(h =>
    toQuest(h, completedToday.has(h.id), datesByHabit.get(h.id) ?? new Set(), today, progressByHabit.get(h.id) ?? 0)
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
 * One-time quests SCHEDULED for TODAY (UTC) — for re-arming their one-shot
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
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, reminder_time')
    .eq('user_id', userId)
    .eq('archived', false)
    .eq('quest_type', 'one_time')
    .eq('scheduled_date', toDateKey(today));
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5) }));
}

export async function updateHabit(id: string, input: HabitInput) {
  const { error } = await supabase.from('habits').update(habitColumns(input)).eq('id', id);
  if (error) throw error;
}

/** R-03: "archive" not hard-delete, so history/completions stay intact. */
export async function archiveHabit(id: string) {
  const { error } = await supabase.from('habits').update({ archived: true }).eq('id', id);
  if (error) throw error;
}
