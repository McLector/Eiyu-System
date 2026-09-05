import { formatDisplayDate, monthCells } from '../date-utils';

describe('formatDisplayDate', () => {
  it('formats a local date as "Weekday, Mon D"', () => {
    // 2026-09-02 is a Wednesday. Constructed via local Date(year, monthIndex, day)
    // components (not an ISO string) so this test exercises the local calendar,
    // not UTC parsing.
    expect(formatDisplayDate(new Date(2026, 8, 2))).toBe('Wednesday, Sep 2');
  });

  it('does not zero-pad the day', () => {
    expect(formatDisplayDate(new Date(2026, 8, 5))).toBe('Saturday, Sep 5');
  });
});

describe('monthCells', () => {
  it('pads with leading nulls for days before the 1st, then lists every day in order', () => {
    const cells = monthCells(2026, 8); // September 2026, 30 days
    const firstWeekday = new Date(Date.UTC(2026, 8, 1)).getUTCDay();
    expect(cells.slice(0, firstWeekday).every(c => c === null)).toBe(true);
    expect(cells[firstWeekday]).toBe('2026-09-01');
    const dateCells = cells.filter((c): c is string => c !== null);
    expect(dateCells).toHaveLength(30);
    expect(dateCells[0]).toBe('2026-09-01');
    expect(dateCells[29]).toBe('2026-09-30');
  });

  it('pads the total length to a multiple of 7', () => {
    for (let month = 0; month < 12; month++) {
      expect(monthCells(2026, month).length % 7).toBe(0);
    }
  });

  it('has zero leading padding when the month starts on a Sunday', () => {
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
    const cells = monthCells(year, month);
    expect(cells[0]).not.toBeNull();
  });
});
