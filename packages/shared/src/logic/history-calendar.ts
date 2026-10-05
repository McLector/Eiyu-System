import type { HistoryCompletion } from '../data/history';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface HistoryMonth {
  year: number;
  /** Zero-based, as in `Date`. */
  month: number;
}

/** The month `delta` months away, rolling the year over in either direction. */
export function shiftHistoryMonth({ year, month }: HistoryMonth, delta: number): HistoryMonth {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/**
 * The calendar grid for one month: blanks (null) for the weekdays before the 1st, the day numbers, then blanks to fill
 * the last week. Computed in UTC so the device's own zone cannot move the 1st to another weekday.
 */
export function historyMonthCells(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "YYYY-MM-DD" for a zero-based month. */
export function historyDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** How a day reads on the calendar: a full completion wins over penalty-only, and no completions is no mark. */
export function historyDayStatus(completions: HistoryCompletion[] | undefined): 'full' | 'partial' | null {
  if (!completions || completions.length === 0) return null;
  return completions.some(c => c.kind === 'full') ? 'full' : 'partial';
}
