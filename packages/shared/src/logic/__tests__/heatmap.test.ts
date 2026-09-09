import { heatmapCellState, heatmapMonthLabels, heatmapWeekColumns, heatmapWindowStart } from '../heatmap';
import { addUtcDays, toDateKey } from '../date-utils';

const TODAY = '2026-09-05';

describe('heatmapCellState', () => {
  it('marks any date after today as future, regardless of counts', () => {
    const state = heatmapCellState('2026-09-06', TODAY, { completedCount: 4, scheduledCount: 4 });
    expect(state.isFuture).toBe(true);
    expect(state.isStar).toBe(false);
  });

  it('is a star when completedCount equals a positive scheduledCount and the date is not future', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 4, scheduledCount: 4 });
    expect(state.isFuture).toBe(false);
    expect(state.isStar).toBe(true);
    expect(state.ratio).toBe(1);
  });

  it('is never a star when scheduledCount is 0, even if completedCount is also 0', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 0, scheduledCount: 0 });
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0);
  });

  it('computes a partial ratio for a non-perfect day', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 1, scheduledCount: 4 });
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0.25);
  });

  it('treats undefined counts (no data loaded yet for this date) as scheduledCount 0', () => {
    const state = heatmapCellState('2026-09-01', TODAY, undefined);
    expect(state.isFuture).toBe(false);
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0);
  });

  it('today itself is not future', () => {
    const state = heatmapCellState(TODAY, TODAY, { completedCount: 0, scheduledCount: 3 });
    expect(state.isFuture).toBe(false);
  });
});

describe('heatmapWindowStart', () => {
  it("aligns to the Sunday on/before the 1st of the window's starting month", () => {
    const today = new Date(Date.UTC(2026, 8, 8)); // September 8, 2026
    const start = heatmapWindowStart(6, today);
    const expectedFirstOfMonth = new Date(Date.UTC(2026, 3, 1)); // April 1, 2026 (6 months back incl. September)
    const expectedStart = addUtcDays(expectedFirstOfMonth, -expectedFirstOfMonth.getUTCDay());
    expect(toDateKey(start)).toBe(toDateKey(expectedStart));
    expect(start.getUTCDay()).toBe(0);
  });

  it('normalizes correctly across a year boundary', () => {
    const today = new Date(Date.UTC(2026, 1, 15)); // February 15, 2026
    const start = heatmapWindowStart(6, today);
    const expectedFirstOfMonth = new Date(Date.UTC(2025, 8, 1)); // September 1, 2025
    const expectedStart = addUtcDays(expectedFirstOfMonth, -expectedFirstOfMonth.getUTCDay());
    expect(toDateKey(start)).toBe(toDateKey(expectedStart));
  });

  it('returns the 1st itself, unshifted, when that day is already a Sunday', () => {
    // Find a (year, month) where day 1 is a Sunday by computation, not by
    // an unverified hardcoded calendar claim.
    let year = 2026;
    let month = 0;
    while (new Date(Date.UTC(year, month, 1)).getUTCDay() !== 0) {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const today = new Date(Date.UTC(year, month + 5, 15)); // 5 months later, so monthsBack=6 lands back on this month
    const start = heatmapWindowStart(6, today);
    expect(toDateKey(start)).toBe(toDateKey(firstOfMonth));
  });
});

describe('heatmapWeekColumns', () => {
  it('produces columns of exactly 7 entries with no leading nulls, since the input is pre-aligned to Sunday', () => {
    const start = heatmapWindowStart(1, new Date(Date.UTC(2026, 8, 8)));
    const end = addUtcDays(start, 10); // one full week plus 3 extra days
    const columns = heatmapWeekColumns(start, end);
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveLength(7);
    expect(columns[0][0]).toBe(toDateKey(start));
    expect(columns[0].every(c => c !== null)).toBe(true);
  });

  it('pads the trailing partial week with nulls so every column stays 7 elements', () => {
    const start = heatmapWindowStart(1, new Date(Date.UTC(2026, 8, 8)));
    const end = addUtcDays(start, 10);
    const columns = heatmapWeekColumns(start, end);
    const lastColumn = columns[1];
    expect(lastColumn).toHaveLength(7);
    expect(lastColumn.slice(0, 3).every(c => c !== null)).toBe(true);
    expect(lastColumn.slice(3).every(c => c === null)).toBe(true);
  });

  it('walks every real day from startDate to endDate exclusive, in order', () => {
    const start = heatmapWindowStart(1, new Date(Date.UTC(2026, 8, 8)));
    const end = addUtcDays(start, 10);
    const columns = heatmapWeekColumns(start, end);
    const realDates = columns.flat().filter((c): c is string => c !== null);
    expect(realDates).toHaveLength(10);
    expect(realDates[0]).toBe(toDateKey(start));
    expect(realDates[9]).toBe(toDateKey(addUtcDays(start, 9)));
  });
});

describe('heatmapMonthLabels', () => {
  it("places one label per month at the column containing that month's 1st, including a December -> January rollover", () => {
    const columns: (string | null)[][] = [
      ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'],
      ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'],
      ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'],
    ];
    const labels = heatmapMonthLabels(columns);
    expect(labels).toEqual([
      { columnIndex: 0, label: 'Sep' },
      { columnIndex: 2, label: 'Jan' },
    ]);
  });

  it('returns nothing for a span of columns with no month start in it', () => {
    const columns: (string | null)[][] = [
      ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'],
    ];
    expect(heatmapMonthLabels(columns)).toEqual([]);
  });

  it('handles a trailing partial column with null padding without erroring', () => {
    const columns: (string | null)[][] = [
      ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', null, null, null],
    ];
    expect(heatmapMonthLabels(columns)).toEqual([]);
  });
});
