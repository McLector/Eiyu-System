import {
  accountDateKey,
  isRecurringHabitEligible,
  millisecondsUntilNextAccountDay,
  nextAccountWeekdayInstant,
  weekdayForDateKey,
  zonedDateTimeInstant,
  zonedDayBounds,
} from '../date-utils';
import { streakStateFromOccurrences } from '../eiyu-logic';

describe('persisted-timezone scheduled eligibility', () => {
  const mwf = [1, 3, 5];
  const week = [
    ['2026-09-07', true],
    ['2026-09-08', false],
    ['2026-09-09', true],
    ['2026-09-10', false],
    ['2026-09-11', true],
    ['2026-09-12', false],
    ['2026-09-13', false],
  ] as const;

  it.each(week)('evaluates M/W/F for %s', (dateKey, expected) => {
    expect(isRecurringHabitEligible(mwf, '2026-09-07', dateKey)).toBe(expected);
  });

  it('does not create historical eligibility before the local creation date', () => {
    expect(isRecurringHabitEligible(mwf, '2026-09-09', '2026-09-07')).toBe(false);
    expect(isRecurringHabitEligible(mwf, '2026-09-09', '2026-09-09')).toBe(true);
  });

  it('uses the persisted account timezone consistently across devices', () => {
    const instant = new Date('2026-12-31T15:30:00.000Z');
    expect(accountDateKey(instant, 'Asia/Manila')).toBe('2026-12-31');
    expect(accountDateKey(instant, 'America/Los_Angeles')).toBe('2026-12-31');
    expect(accountDateKey(new Date('2026-12-31T16:30:00.000Z'), 'Asia/Manila')).toBe('2027-01-01');
  });

  it('derives weekday from the canonical calendar key across month/year changes', () => {
    expect(weekdayForDateKey('2026-12-31')).toBe(4);
    expect(weekdayForDateKey('2027-01-01')).toBe(5);
  });

  it('uses local midnight on 23-hour and 25-hour daylight-saving days', () => {
    const spring = zonedDayBounds('2026-03-08', 'America/New_York');
    const fall = zonedDayBounds('2026-11-01', 'America/New_York');

    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
    expect(accountDateKey(spring.start, 'America/New_York')).toBe('2026-03-08');
    expect(accountDateKey(fall.start, 'America/New_York')).toBe('2026-11-01');
  });

  it('schedules day rollover at account midnight rather than device or UTC midnight', () => {
    expect(
      millisecondsUntilNextAccountDay(
        new Date('2026-09-07T15:59:59.999Z'),
        'Asia/Manila'
      )
    ).toBe(1);
  });

  it('turns reminder wall-clock values into exact account-timezone instants', () => {
    expect(zonedDateTimeInstant('2026-09-12', '00:00', 'Asia/Manila').toISOString()).toBe(
      '2026-09-11T16:00:00.000Z'
    );
    expect(zonedDateTimeInstant('2026-03-08', '03:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z'
    );
  });

  it('finds the next reminder weekday in the persisted account timezone', () => {
    const next = nextAccountWeekdayInstant(
      new Date('2026-09-07T16:30:00.000Z'),
      1,
      '00:15',
      'Asia/Manila'
    );
    expect(next.toISOString()).toBe('2026-09-13T16:15:00.000Z');
  });

  it('does not treat an off-day as a miss', () => {
    const state = streakStateFromOccurrences(
      new Set(['2026-09-07', '2026-09-09']),
      new Set(['2026-09-07', '2026-09-09']),
      new Date('2026-09-10T12:00:00.000Z'),
      'UTC'
    );
    expect(state).toEqual({ current: 2, state: 'active' });
  });

  it('keeps the prior run when prospective schedule edits add different weekdays', () => {
    const occurrences = new Set([
      '2026-09-07',
      '2026-09-09',
      '2026-09-11',
      '2026-09-15',
      '2026-09-17',
    ]);
    const state = streakStateFromOccurrences(
      occurrences,
      new Set(occurrences),
      new Date('2026-09-17T12:00:00.000Z'),
      'UTC'
    );
    expect(state).toEqual({ current: 5, state: 'active' });
  });
});
