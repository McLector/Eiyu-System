import { accountDateKey } from '../logic/date-utils';
import { streakStateFromOccurrences } from '../logic/eiyu-logic';
import { supabase } from '../supabase/client';
import { Database } from '../types/database';
import { Difficulty, Quest, QuestGenre, QuestType, Stat } from '../types/eiyu';
import { initializeAccountTimeZone } from './profile';
import { normalizeEditableQuestName } from '../logic/validation';
import { byPosition, hasManualOrder } from '../logic/manual-order';
import { readBatches } from './pagination';
import { type TrackerRevision, type TrackerTargetSnapshot } from './tracker-access';
import { invokeTrackerWrite, isRefusedBeforeSend, NO_TARGETS, trackerErrorKind } from './tracker-writes';
import { isConfirmedFailure } from './save-outcome';
import { withTrackerClassification } from './tracker-classify';
import { habitGatewayInput, type HabitEditorInput } from '../logic/tracker-input';

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
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    position: typeof row.position === 'number' ? row.position : undefined,
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
 * Board data: every recurring habit definition plus the one-time quests that
 * are on today's board (dated today, undated, or upcoming; 042), with current
 * completion, streak, recovery, and schedule eligibility.
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

  const quests = boardItems.map(h =>
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
  return withTrackerClassification('habit', quests, userId);
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
  /** One-time quests only; "YYYY-MM-DD" local calendar date, or null/absent for "No date". Ignored/null for recurring habits (Slice 4). */
  scheduledDate?: string | null;
  /** Quantity-habit target (>1); habit-type only, ignored/null for one-time (Slice 5). */
  targetCount?: number | null;
  /** One-time and Backlog quests only. Habits are always stored without a genre. */
  genre?: QuestGenre | null;
  /** One-time quests: false means "no set time". Backlog is always untimed, habits always timed. */
  timeSet?: boolean;
}

/** Normalizes the one field the client still validates (the custom name); the server owns everything else. */
function preparedEditor(input: HabitEditorInput, originalName?: string) {
  if (input?.mode === 'custom') {
    return habitGatewayInput({ mode: 'custom', values: { ...input.values, name: normalizeEditableQuestName(input.values?.name, originalName) } });
  }
  return habitGatewayInput(input);
}

/**
 * Creates through the revision-bound gateway. `creationId` is chosen by the editor and kept across uncertain retries, so
 * a retry of a save that already landed returns the same id instead of making a second quest. `userId` stays for API
 * stability: the owner is the revision's `userId`.
 */
export async function createHabit(
  userId: string,
  input: HabitEditorInput,
  expected: TrackerRevision,
  creationId: string
): Promise<string> {
  void userId;
  if (typeof creationId !== 'string' || !creationId) throw new Error('This quest could not be prepared to save.');
  const { mode, input: payload } = preparedEditor(input);
  const id = await invokeTrackerWrite<unknown>('habit-save', { p_id: creationId, p_create: true, p_mode: mode, p_input: payload }, expected, NO_TARGETS);
  if (typeof id !== 'string' || id.toLowerCase() !== creationId.toLowerCase()) throw new Error('The save result could not be confirmed. Check the quest before retrying.');
  return id;
}

export interface ActiveHabitReminder {
  id: string;
  name: string;
  time: string;
  days: number[];
  /** Server classification for reminder filtering; absent means unclassified (treated as custom). */
  inputKind?: 'basic' | 'custom';
  canWrite?: boolean;
}

export interface UpcomingOneTimeReminder {
  id: string;
  name: string;
  time: string;
  date: string;
  inputKind?: 'basic' | 'custom';
  canWrite?: boolean;
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
  return withTrackerClassification('habit', (data ?? []).map(h => ({ id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), days: h.days })), userId);
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

export async function updateHabit(
  id: string,
  input: HabitEditorInput,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[],
  originalName?: string
): Promise<void> {
  const { mode, input: payload } = preparedEditor(input, originalName);
  await invokeTrackerWrite<unknown>('habit-save', { p_id: id, p_create: false, p_mode: mode, p_input: payload }, expected, targets);
}

/** All upcoming active one-time reminders, including future dates. */
export async function fetchUpcomingOneTimeHabits(
  userId: string
): Promise<UpcomingOneTimeReminder[]> {
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
  return withTrackerClassification('habit', (data ?? []).filter(h => h.scheduled_date != null).map(h => ({
    id: h.id, name: h.name, time: h.reminder_time.slice(0, 5), date: h.scheduled_date!,
  })), userId);
}

/** Active Backlog quests in their manual order, or newest first until every row has a position (before 044). Kept apart from the board read: Backlog has no day, so the daily RPC never returns it. */
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
  const ordered = hasManualOrder(rows)
    ? byPosition(rows)
    : rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  return withTrackerClassification('habit', ordered
    .map(row => toQuest(row, false, new Set(), new Set(), new Date(), 0, 'UTC', false)), userId);
}

/**
 * Saves a lane's manual order. `ids` are the unfinished quests the screen shows, in their new order; the server
 * puts them into the slots they already hold, so quests it does not show keep their place. `targets` has a snapshot for
 * every id in `ids`.
 */
export async function reorderQuests(
  questType: QuestType,
  ids: string[],
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[]
): Promise<void> {
  await invokeTrackerWrite<unknown>('reorder_quests', { p_quest_type: questType, p_ids: [...ids] }, expected, targets);
}

/** Server-dated: the account's current day, never a client clock. */
export async function moveBacklogToOneTime(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('move_backlog_to_one_time', { p_id: id }, expected, targets);
}

/** Refused by the server when the quest already has a completion. */
export async function moveOneTimeToBacklog(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('move_one_time_to_backlog', { p_id: id }, expected, targets);
}

/** Phase 1: archive through the server boundary so pause metadata is recorded. */
export async function archiveHabit(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('archive_habit', { p_habit_id: id }, expected, targets);
}

/** Phase 1: restore through the server boundary so paused dates are not backfilled. */
export async function restoreHabit(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  await invokeTrackerWrite<unknown>('restore_habit', { p_habit_id: id }, expected, targets);
}

/** Habits whose delete went out and failed without a confirmed answer: a later "target unavailable" may be its own success. */
const uncertainDeletes = new Set<string>();

/**
 * Phase 1: permanently remove the executable definition while retaining history. The server no longer treats a repeat as
 * a no-op (it answers 42501 for a missing habit), so a retry that gets 42501 after this session's own uncertain attempt is
 * settled, once. Any other 42501 is a real refusal.
 */
export async function deleteHabit(id: string, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<void> {
  try {
    await invokeTrackerWrite<unknown>('delete_habit', { p_habit_id: id }, expected, targets);
    uncertainDeletes.delete(id);
  } catch (error) {
    if (!isRefusedBeforeSend(error)) {
      if (trackerErrorKind(error) === 'denied' && uncertainDeletes.delete(id)) return;
      if (!isConfirmedFailure(error) && !trackerErrorKind(error)) uncertainDeletes.add(id);
      else uncertainDeletes.delete(id);
    }
    throw error;
  }
}
