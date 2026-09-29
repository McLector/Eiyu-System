import { addDateKeyDays, addUtcDays, toDateKey } from '../logic/date-utils';
import { supabase } from '../supabase/client';
import { CompletionKind } from '../types/database';
import { Stat } from '../types/eiyu';
import { initializeAccountTimeZone } from './profile';

export interface HistoryCompletion {
  habitName: string;
  kind: CompletionKind;
}

/**
 * Per-date detail for the history calendar and the Slice 6 heatmap.
 * `completions` is unfiltered — every habit actually completed that day,
 * including ones since archived (matches the pre-Slice-6 tooltip behavior).
 * `completedCount`/`scheduledCount` use immutable recurring-habit occurrence
 * rows, so schedule edits and later archiving cannot rewrite historical days.
 */
export interface DayHistory {
  completions: HistoryCompletion[];
  completedCount: number;
  scheduledCount: number;
}

export type HistoryByDate = Record<string, DayHistory>;

export type HistoryEvidenceRow = {
  source_habit_id: string;
  historical_date: string;
  habit_name: string;
  stat: Stat;
  quest_type: 'habit' | 'one_time';
  scheduled: boolean;
  completion_kind: CompletionKind | null;
};

export type HistorySnapshot = {
  rows: HistoryEvidenceRow[];
  habits: { id: string; name: string; stat: Stat }[];
  recurring_totals: Partial<Record<Stat, number>>;
};

/** Stable detail paging within the immutable single-request database snapshot. */
export function pageHistoryEvidence(snapshot: HistorySnapshot, offset: number, limit: number): HistoryEvidenceRow[] {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('History page offset and limit must be positive integers');
  }
  return snapshot.rows.slice(offset, offset + limit);
}

/**
 * One statement returns ordered normalized detail and exact recurring totals.
 * The JSON envelope is one PostgREST result row, so its detail is not clipped
 * by max_rows. Consumers page the returned immutable array locally if needed.
 */
export async function fetchHistoryEvidence(
  startDate: string,
  endDate: string
): Promise<HistorySnapshot> {
  const { data, error } = await supabase.rpc('read_history_range', {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  const snapshot = data as HistorySnapshot | null;
  if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.habits) || !snapshot.recurring_totals) {
    throw new Error('History snapshot response is invalid');
  }
  return snapshot;
}

/** Completions + heatmap ratio for every day in `[startDate, endDate)`, grouped by date key. */
export async function fetchHistoryRange(userId: string, startDate: Date, endDate: Date): Promise<HistoryByDate> {
  const startStr = toDateKey(startDate);
  const endStr = toDateKey(endDate);
  await initializeAccountTimeZone();

  const { error: ensureError } = await supabase.rpc('ensure_habit_occurrences', {
    p_through_date: addDateKeyDays(endStr, -1),
  });
  if (ensureError) throw ensureError;

  const boundaryRows = (await fetchHistoryEvidence(startStr, endStr)).rows;
  const rowsByDate = new Map<string, HistoryEvidenceRow[]>();
  for (const row of boundaryRows) {
    const rows = rowsByDate.get(row.historical_date) ?? [];
    rows.push(row);
    rowsByDate.set(row.historical_date, rows);
  }
  const byDate: HistoryByDate = {};
  for (let d = startDate; d < endDate; d = addUtcDays(d, 1)) {
    const dateKey = toDateKey(d);
    const rows = rowsByDate.get(dateKey) ?? [];
    const scheduledIds = new Set(rows.filter(row => row.scheduled && row.quest_type === 'habit').map(row => row.source_habit_id));
    byDate[dateKey] = {
      completions: rows.filter(row => row.completion_kind).map(row => ({ habitName: row.habit_name, kind: row.completion_kind! })),
      completedCount: rows.filter(row => row.completion_kind && scheduledIds.has(row.source_habit_id)).length,
      // One-time completions are shown in details, while heatmap ratios keep
      // the recurring-only occurrence contract.
      scheduledCount: scheduledIds.size,
    };
  }
  return byDate;
}

/** Completions + heatmap ratio for a calendar month, grouped by canonical date key. */
export function fetchMonthHistory(userId: string, year: number, month: number): Promise<HistoryByDate> {
  return fetchHistoryRange(userId, new Date(Date.UTC(year, month, 1)), new Date(Date.UTC(year, month + 1, 1)));
}
