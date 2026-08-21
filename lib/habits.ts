import { addUtcDays, toDateKey } from '@/lib/date-utils';
import { streakState } from '@/lib/eiyu-logic';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import { Difficulty, Quest, Stat } from '@/types/eiyu';

type HabitRow = Database['public']['Tables']['habits']['Row'];

function toQuest(row: HabitRow, completedToday: boolean, completedDates: Set<string>, now: Date): Quest {
  const state = streakState(row.days, completedDates, now, new Date(row.created_at));
  return {
    id: row.id,
    name: row.name,
    stat: row.stat,
    difficulty: row.difficulty,
    easyVersion: row.easy_version,
    time: row.reminder_time.slice(0, 5),
    days: row.days,
    streak: state.current,
    frozen: state.state === 'frozen',
    frozenHoursLeft: state.frozenHoursLeft,
    frozenDate: state.frozenDate,
    completed: completedToday,
  };
}

/** Habits scheduled for today, sorted by reminder time, with today's completion state and streak (R-10). */
export async function fetchTodayHabits(userId: string): Promise<Quest[]> {
  const today = new Date();
  // UTC throughout to stay consistent with completed_on (an ISO date string)
  // and streakState's day-of-week math — mixing local getDay() with UTC date
  // keys silently shifts the day for users outside UTC.
  const dayOfWeek = today.getUTCDay();
  const todayStr = toDateKey(today);

  const { data: habits, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .contains('days', [dayOfWeek])
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

  return habits.map(h => toQuest(h, completedToday.has(h.id), datesByHabit.get(h.id) ?? new Set(), today));
}

export interface HabitInput {
  name: string;
  easyVersion: string;
  stat: Stat;
  difficulty: Difficulty;
  time: string;
  days: number[];
}

export async function createHabit(userId: string, input: HabitInput): Promise<string> {
  const { data, error } = await supabase
    .from('habits')
    .insert({
      user_id: userId,
      name: input.name,
      easy_version: input.easyVersion,
      stat: input.stat,
      difficulty: input.difficulty,
      reminder_time: input.time,
      days: input.days,
    })
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

/** All non-archived habits regardless of today's schedule — for (re)scheduling local reminders (R-40). */
export async function fetchAllActiveHabits(userId: string): Promise<ActiveHabitReminder[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, reminder_time, days')
    .eq('user_id', userId)
    .eq('archived', false);
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), days: h.days }));
}

export async function updateHabit(id: string, input: HabitInput) {
  const { error } = await supabase
    .from('habits')
    .update({
      name: input.name,
      easy_version: input.easyVersion,
      stat: input.stat,
      difficulty: input.difficulty,
      reminder_time: input.time,
      days: input.days,
    })
    .eq('id', id);
  if (error) throw error;
}

/** R-03: "archive" not hard-delete, so history/completions stay intact. */
export async function archiveHabit(id: string) {
  const { error } = await supabase.from('habits').update({ archived: true }).eq('id', id);
  if (error) throw error;
}
