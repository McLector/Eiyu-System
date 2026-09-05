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
