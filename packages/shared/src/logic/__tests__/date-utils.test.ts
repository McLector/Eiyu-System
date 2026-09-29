import { accountDateKey, formatDisplayDate, weekdayForDateKey } from '../date-utils';

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

describe('account calendar boundaries', () => {
  it('uses the account day and weekday on either side of UTC year end', () => {
    const instant = new Date('2026-12-31T11:30:00.000Z');
    expect(accountDateKey(instant, 'Pacific/Kiritimati')).toBe('2027-01-01');
    expect(accountDateKey(instant, 'Pacific/Auckland')).toBe('2027-01-01');
    expect(accountDateKey(instant, 'Pacific/Fiji')).toBe('2026-12-31');
    expect(accountDateKey(instant, 'America/Los_Angeles')).toBe('2026-12-31');
    expect(accountDateKey(instant, 'Pacific/Honolulu')).toBe('2026-12-31');
    expect(weekdayForDateKey('2026-12-31')).toBe(4);
    expect(weekdayForDateKey('2027-01-01')).toBe(5);
  });
});
