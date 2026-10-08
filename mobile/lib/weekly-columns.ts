/** Width of the stat-name column on the left of the Weekly Stats matrix, in dp. */
export const WEEKLY_LABEL_WIDTH = 44;
export const WEEKLY_DAYS = 7;

/**
 * Width of one day column when the label column and `days` equal columns must fit inside `containerWidth`.
 * Rounded DOWN to half a dp so the columns together never overflow the container. Returns 0 for any input that
 * cannot produce a sensible column (not finite, no days, no room beyond the label column).
 */
export function weeklyColumnWidth(
  containerWidth: number,
  days: number = WEEKLY_DAYS,
  labelWidth: number = WEEKLY_LABEL_WIDTH,
): number {
  if (!Number.isFinite(containerWidth) || !Number.isFinite(days) || !Number.isFinite(labelWidth)) return 0;
  if (days <= 0) return 0;
  const room = containerWidth - labelWidth;
  if (room <= 0) return 0;
  return Math.floor((room / days) * 2) / 2;
}
