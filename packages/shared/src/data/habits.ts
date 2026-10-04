import { accountDateKey } from '../logic/date-utils';
import { streakStateFromOccurrences } from '../logic/eiyu-logic';
import { supabase } from '../supabase/client';
import { Database } from '../types/database';
import { Difficulty, Quest, QuestGenre, QuestType, Stat } from '../types/eiyu';
import { initializeAccountTimeZone } from './profile';
import { normalizeEditableQuestName } from '../logic/validation';
import { readBatches } from './pagination';

type HabitRow = Database['public']['Tables']['habits']['Row'];
type RecoveryRow = Database['public']['Functions']['get_open_habit_recoveries']['Returns'][number];

/** Ids per request: keeps an .in() list well under the request-URL limit. */
const HABIT_ID_CHUNK = 100;
/** Reads per-habit rows for any number of habits: id lists are chunked and each chunk is read in bounded batches. */
async function readForHabits<T>(
  ids: string[],
  read: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += HABIT_ID_CHUNK) {
    const chunk = ids.slice(start, start + HABIT_ID_CHUNK);
    rows.push(...(await readBatches((from, to) => read(chunk, from, to))));
  }
  return rows;
}

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
    recovery || row.quest_type !== 'habit'
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
    genre: row.genre ?? null,
    timeSet: row.time_set ?? true,
    createdAt: row.created_at,
    archived: row.archived,
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
 * Board data: every recurring habit definition plus today's eligible one-time
 * quests, with current completion, streak, recovery, and schedule eligibility.
 * The authoritative RPC still determines which definitions have a dated
 * occurrence for the account-local day; catalog rows never create eligibility.
 */
export async function fetchTodayHabits(userId: string): Promise<Quest[]> {
  const today = new Date();
  const timeZone = await initializeAccountTimeZone();
  const todayStr = accountDateKey(today, timeZone);

  // The RPC materializes unique eligible occurrences and returns only habits
  // joined to today's occurrence. Mobile and web therefore share the exact
  // same authoritative schedule result, including after schedule edits.
  // Every read below is bounded: the API caps a response at 1,000 rows, so an unpaged read would silently drop
  // habits, and an unbounded .in() list would exceed the request-URL limit. Stable ordering keeps pages disjoint.
  const todayItems = await readBatches((from, to) =>
    supabase.rpc('get_habits_for_date', { p_date: todayStr }).order('id').range(from, to)
  );

  const { data: recoveries, error: recoveriesError } = await supabase.rpc(
    'get_open_habit_recoveries',
    {}
  );
  if (recoveriesError) throw recoveriesError;

  const openRecoveries = recoveries ?? [];
  const dailyIds = new Set(
    todayItems.filter(item => item.quest_type === 'habit').map(habit => habit.id)
  );
  const oneTimeItems = todayItems.filter(item => item.quest_type === 'one_time');

  // Active recurring habits stay in the catalog; archived definitions of either
  // type stay reachable for Restore/Delete. Active one-time quests are admitted
  // only from today's authoritative RPC result.
  const catalog = await readBatches((from, to) =>
    supabase.from('habits').select('*').eq('user_id', userId).order('id').range(from, to)
  );
  const catalogHabits = catalog.filter(
    habit => habit.archived || habit.quest_type === 'habit'
  ).sort(
    (a, b) => Number(a.archived) - Number(b.archived)
      || Number(a.time_set === false) - Number(b.time_set === false)
      || a.reminder_time.localeCompare(b.reminder_time)
  );

  const boardItems = [...new Map(
    [...catalogHabits, ...oneTimeItems].map(habit => [habit.id, habit])
  ).values()];
  if (boardItems.length === 0) return [];
  const allHabitIds = boardItems.map(habit => habit.id);
  const recoveryByHabit = new Map(openRecoveries.map(recovery => [recovery.habit_id, recovery]));

  const completions = await readForHabits(allHabitIds, (ids, from, to) =>
    supabase
      .from('habit_completions')
      .select('habit_id, completed_on')
      .eq('user_id', userId)
      .in('habit_id', ids)
      .order('habit_id')
      .order('completed_on')
      .range(from, to)
  );

  const completedToday = new Set<string>();
  const datesByHabit = new Map<string, Set<string>>();
  for (const c of completions) {
    if (c.completed_on === todayStr) completedToday.add(c.habit_id);
    if (!datesByHabit.has(c.habit_id)) datesByHabit.set(c.habit_id, new Set());
    datesByHabit.get(c.habit_id)!.add(c.completed_on);
  }

  const occurrences = await readForHabits(allHabitIds, (ids, from, to) =>
    supabase
      .from('habit_occurrences')
      .select('habit_id, occurrence_date')
      .eq('user_id', userId)
      .in('habit_id', ids)
      .lte('occurrence_date', todayStr)
      .order('habit_id')
      .order('occurrence_date')
      .range(from, to)
  );
  const occurrencesByHabit = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    if (!occurrencesByHabit.has(occurrence.habit_id)) {
      occurrencesByHabit.set(occurrence.habit_id, new Set());
    }
    occurrencesByHabit.get(occurrence.habit_id)!.add(occurrence.occurrence_date);
  }

  // Slice 5: today's running count for any quantity habit in this batch.
  const progress = await readForHabits(allHabitIds, (ids, from, to) =>
    supabase
      .from('habit_progress')
      .select('habit_id, progress_count')
      .eq('user_id', userId)
      .eq('progress_date', todayStr)
      .in('habit_id', ids)
      .order('habit_id')
      .range(from, to)
  );
  const progressByHabit = new Map<string, number>();
  for (const p of progress) progressByHabit.set(p.habit_id, p.progress_count);

  return boardItems.map(h =>
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
  /** One-time and Backlog quests only. Habits are always stored without a genre. */
  genre?: QuestGenre | null;
  /** One-time quests: false means "no set time". Backlog is always untimed, habits always timed. */
  timeSet?: boolean;
}

/** Shared insert/update column mapping so both write paths stay in lockstep. */
function habitColumns(input: HabitInput) {
  const type: QuestType = input.questType ?? 'habit';
  return {
    name: input.name,
    // Only recurring habits have a penalty (easy version).
    easy_version: type !== 'habit' ? null : input.easyVersion?.trim() ? input.easyVersion.trim() : null,
    description: input.description?.trim() ? input.description.trim() : null,
    quest_type: type,
    stat: input.stat,
    difficulty: input.difficulty,
    reminder_time: input.time,
    days: type === 'backlog' ? [] : input.days,
    scheduled_date: type === 'one_time' ? (input.scheduledDate ?? null) : null,
    target_count: type === 'habit' ? (input.targetCount ?? null) : null,
    // Sent only when the caller supplied them, so an edit that never read them cannot reset them.
    ...(type === 'habit' ? { genre: null } : input.genre !== undefined ? { genre: input.genre } : {}),
    ...(type === 'backlog' ? { time_set: false } : type === 'habit' ? { time_set: true } : input.timeSet !== undefined ? { time_set: input.timeSet } : {}),
  };
}

export async function createHabit(userId: string, input: HabitInput): Promise<string> {
  const name = normalizeEditableQuestName(input.name);
  await initializeAccountTimeZone();
  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id: userId, ...habitColumns({ ...input, name }) })
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
 * (re)scheduling local reminders (R-40). One-time and Backlog quests are excluded on
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
    .eq('quest_type', 'habit');
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), days: h.days }));
}

/**
 * One-time quests scheduled for the current account-local date. Untimed quests have nothing to remind about;
 * they are left out. Used for re-arming their one-shot
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
    .eq('time_set', true)
    .eq('scheduled_date', accountDateKey(today, timeZone));
  if (error) throw error;
  return (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5) }));
}

export async function updateHabit(id: string, input: HabitInput, originalName?: string) {
  const name = normalizeEditableQuestName(input.name, originalName);
  await initializeAccountTimeZone();
  const { data, error } = await supabase
    .from('habits')
    .update(habitColumns({ ...input, name }))
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This quest no longer exists or could not be updated. Reload the board before saving.');
}

/** All upcoming active one-time reminders, including future dates. */
export async function fetchUpcomingOneTimeHabits(
  userId: string
): Promise<{ id: string; name: string; time: string; date: string }[]> {
  const timeZone = await initializeAccountTimeZone();
  const today = accountDateKey(new Date(), timeZone);
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, reminder_time, scheduled_date')
    .eq('user_id', userId)
    .eq('archived', false)
    .eq('quest_type', 'one_time')
    .eq('time_set', true)
    .gte('scheduled_date', today);
  if (error) throw error;
  return (data ?? []).filter(h => h.scheduled_date != null).map(h => ({
    id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), date: h.scheduled_date!,
  }));
}

/** Active Backlog quests, newest first. Kept apart from the board read: Backlog has no day, so the daily RPC never returns it. */
export async function fetchBacklogQuests(userId: string): Promise<Quest[]> {
  const rows = await readBatches((from, to) =>
    supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .eq('quest_type', 'backlog')
      .eq('archived', false)
      .order('id')
      .range(from, to)
  );
  return rows
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
    .map(row => toQuest(row, false, new Set(), new Set(), new Date(), 0, 'UTC', false));
}

/** Server-dated: the account's current day, never a client clock. */
export async function moveBacklogToOneTime(id: string): Promise<void> {
  const { error } = await supabase.rpc('move_backlog_to_one_time', { p_id: id });
  if (error) throw error;
}

/** Refused by the server when the quest already has a completion. */
export async function moveOneTimeToBacklog(id: string): Promise<void> {
  const { error } = await supabase.rpc('move_one_time_to_backlog', { p_id: id });
  if (error) throw error;
}

/** Phase 1: archive through the server boundary so pause metadata is recorded. */
export async function archiveHabit(id: string) {
  const { error } = await supabase.rpc('archive_habit', { p_habit_id: id });
  if (error) throw error;
}

/** Phase 1: restore through the server boundary so paused dates are not backfilled. */
export async function restoreHabit(id: string) {
  const { error } = await supabase.rpc('restore_habit', { p_habit_id: id });
  if (error) throw error;
}

/** Phase 1: permanently remove the executable definition while retaining history. */
export async function deleteHabit(id: string) {
  const { error } = await supabase.rpc('delete_habit', { p_habit_id: id });
  if (error) throw error;
}
