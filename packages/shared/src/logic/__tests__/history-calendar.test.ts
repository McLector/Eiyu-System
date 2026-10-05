
import { historyDayKey, historyDayStatus, historyMonthCells, MONTH_NAMES, shiftHistoryMonth } from '../history-calendar';

describe('shiftHistoryMonth', () => {
  it('steps within a year', () => {
    expect(shiftHistoryMonth({ year: 2026, month: 4 }, 1)).toEqual({ year: 2026, month: 5 });
    expect(shiftHistoryMonth({ year: 2026, month: 4 }, -1)).toEqual({ year: 2026, month: 3 });
  });

  it('wraps December to January and January to December across years', () => {
    expect(shiftHistoryMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftHistoryMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('copes with a delta of zero and of more than a year', () => {
    expect(shiftHistoryMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
    expect(shiftHistoryMonth({ year: 2026, month: 5 }, 14)).toEqual({ year: 2027, month: 7 });
    expect(shiftHistoryMonth({ year: 2026, month: 5 }, -6)).toEqual({ year: 2025, month: 11 });
  });
});

describe('historyMonthCells', () => {
  it('pads the first week with blanks for the weekday the month starts on', () => {
    // 1 Oct 2026 is a Thursday: four blanks, 31 days, then padded to 35.
    const cells = historyMonthCells(2026, 9);
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toBe(1);
    expect(cells.filter(cell => cell !== null)).toHaveLength(31);
    expect(cells).toHaveLength(35);
    expect(cells[cells.length - 1]).toBe(31); // the 31st is a Saturday, so no trailing blanks
  });

  it('needs no leading blanks when the month starts on a Sunday', () => {
    // 1 Feb 2026 is a Sunday and the month has 28 days: exactly four full weeks.
    const cells = historyMonthCells(2026, 1);
    expect(cells[0]).toBe(1);
    expect(cells).toHaveLength(28);
  });

  it('knows leap Februaries', () => {
    expect(historyMonthCells(2028, 1).filter(cell => cell !== null)).toHaveLength(29);
    expect(historyMonthCells(2027, 1).filter(cell => cell !== null)).toHaveLength(28);
  });

  it('pads a short last week with trailing blanks to a multiple of seven', () => {
    // 1 Sep 2026 is a Tuesday: two blanks + 30 days = 32 -> 35 cells, ending in three blanks.
    const cells = historyMonthCells(2026, 8);
    expect(cells).toHaveLength(35);
    expect(cells.slice(-3)).toEqual([null, null, null]);
    expect(cells[31]).toBe(30);
  });

  it('can spill into a sixth week', () => {
    // 1 Aug 2026 is a Saturday: six blanks + 31 days = 37 -> 42 cells.
    expect(historyMonthCells(2026, 7)).toHaveLength(42);
  });
});

describe('historyDayKey', () => {
  it('writes a zero-padded date for a zero-based month', () => {
    expect(historyDayKey(2026, 0, 5)).toBe('2026-01-05');
    expect(historyDayKey(2026, 11, 31)).toBe('2026-12-31');
  });
});

describe('historyDayStatus', () => {
  it('is null for no record or an empty day', () => {
    expect(historyDayStatus(undefined)).toBeNull();
    expect(historyDayStatus([])).toBeNull();
  });

  it('is full as soon as any completion was a full one', () => {
    expect(historyDayStatus([{ habitName: 'a', kind: 'easy' }, { habitName: 'b', kind: 'full' }])).toBe('full');
  });

  it('is partial when every completion was by penalty', () => {
    expect(historyDayStatus([{ habitName: 'a', kind: 'easy' }])).toBe('partial');
  });
});

describe('MONTH_NAMES', () => {
  it('has twelve names starting in January', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });
});
