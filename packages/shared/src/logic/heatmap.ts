import { addUtcDays, toDateKey } from './date-utils';

export interface HeatmapCellCounts {
  completedCount: number;
  scheduledCount: number;
}

export interface HeatmapCellState {
  isFuture: boolean;
  isStar: boolean;
  ratio: number;
}

/**
 * Pure derivation of a single heatmap day's visual state (Slice 6/8).
 * Deliberately decoupled from `DayHistory` (packages/shared/src/data/
 * history.ts) — this file lives in logic/, which data/ depends on, never
 * the reverse; taking the concrete data-layer type here would invert
 * that direction. `counts` is undefined when no data has loaded yet for
 * this date, treated the same as a 0-scheduled day.
 */
export function heatmapCellState(
  dateKey: string,
  todayKey: string,
  counts: HeatmapCellCounts | undefined
): HeatmapCellState {
  const isFuture = dateKey > todayKey;
  const scheduledCount = counts?.scheduledCount ?? 0;
  const completedCount = counts?.completedCount ?? 0;
  const ratio = scheduledCount > 0 ? completedCount / scheduledCount : 0;
  const isStar = !isFuture && scheduledCount > 0 && completedCount === scheduledCount;
  return { isFuture, isStar, ratio };
}

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The UTC Sunday on/before the 1st of the month that is `monthsBack - 1`
 * months before `today`'s month — e.g. monthsBack=6 with today in September
 * covers April 1 through the end of September, aligned back to the nearest
 * Sunday. `Date.UTC` normalizes negative month arithmetic across year
 * boundaries correctly, so no separate year-rollover branch is needed.
 */
export function heatmapWindowStart(monthsBack: number, today: Date): Date {
  const firstOfWindowMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (monthsBack - 1), 1));
  return addUtcDays(firstOfWindowMonth, -firstOfWindowMonth.getUTCDay());
}

/**
 * GitHub-style week columns from `startDate` (inclusive) to `endDate`
 * (exclusive), each column 7 entries (Sunday first). `startDate` MUST
 * already be Sunday-aligned (pass `heatmapWindowStart`'s output) — this
 * function does not re-align it, to stay a simple composable primitive.
 * The final column is padded with `null` if `endDate` doesn't land exactly
 * on a Sunday, so every column is a full 7-element array.
 */
export function heatmapWeekColumns(startDate: Date, endDate: Date): (string | null)[][] {
  const columns: (string | null)[][] = [];
  let current: (string | null)[] = [];
  for (let d = startDate; d < endDate; d = addUtcDays(d, 1)) {
    current.push(toDateKey(d));
    if (current.length === 7) {
      columns.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    columns.push(current);
  }
  return columns;
}

/**
 * Pure derivation of where to place month-name labels above a
 * `heatmapWeekColumns` grid: one entry per month whose 1st falls inside
 * `columns`, at the column index containing that day. A month has exactly
 * one 1st, which falls in exactly one column, so no dedup logic is needed.
 */
export function heatmapMonthLabels(columns: (string | null)[][]): { columnIndex: number; label: string }[] {
  const labels: { columnIndex: number; label: string }[] = [];
  columns.forEach((column, columnIndex) => {
    for (const dateKey of column) {
      if (dateKey && dateKey.endsWith('-01')) {
        const month = Number(dateKey.slice(5, 7)) - 1;
        labels.push({ columnIndex, label: MONTH_ABBREV[month] });
        break;
      }
    }
  });
  return labels;
}
