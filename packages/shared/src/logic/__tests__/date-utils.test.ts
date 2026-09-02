import { formatDisplayDate } from '../date-utils';

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
