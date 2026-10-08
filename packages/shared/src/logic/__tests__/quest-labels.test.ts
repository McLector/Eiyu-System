import type { Quest } from '../../types/eiyu';
import { QUEST_TYPE_LABEL, oneTimeTiming, questScheduleLabel, questWhenLabel, recoveryDeadlineLabel } from '../quest-labels';

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q', name: 'Quest', stat: 'STR', difficulty: 'Easy', easyVersion: null, description: null, questType: 'habit',
    archived: false, time: '08:00', days: [1, 3], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
    ...overrides,
  } as Quest;
}

describe('QUEST_TYPE_LABEL', () => {
  it('names the three kinds the way the quest form does', () => {
    expect(QUEST_TYPE_LABEL).toEqual({ habit: 'Habit', one_time: '1-Time', backlog: 'Backlog' });
  });
});

describe('questWhenLabel', () => {
  it('says a Backlog quest has no date', () => {
    expect(questWhenLabel(quest({ questType: 'backlog' }))).toBe('No date');
  });
  it('says Today for a one-time quest, with the time only when one is set', () => {
    expect(questWhenLabel(quest({ questType: 'one_time', timeSet: false }))).toBe('Today');
    expect(questWhenLabel(quest({ questType: 'one_time', timeSet: true, time: '09:30' }))).toBe('Today 09:30');
    expect(questWhenLabel(quest({ questType: 'one_time', time: '09:30' }))).toBe('Today 09:30');
  });
  it('lists the days of a habit, or Every day when it runs all seven', () => {
    expect(questWhenLabel(quest({ days: [1, 3, 5], time: '07:15' }))).toBe('Mon, Wed, Fri 07:15');
    expect(questWhenLabel(quest({ days: [0, 1, 2, 3, 4, 5, 6], time: '07:15' }))).toBe('Every day 07:15');
  });
});

describe('questScheduleLabel', () => {
  const today = '2026-10-05';
  it('says a Backlog quest has no date yet', () => {
    expect(questScheduleLabel(quest({ questType: 'backlog' }), today)).toBe('No date yet');
  });
  it('says Today for a one-time quest dated today (or undated), with or without a time', () => {
    expect(questScheduleLabel(quest({ questType: 'one_time', scheduledDate: today, time: '09:30', timeSet: true }), today)).toBe('Today at 09:30');
    expect(questScheduleLabel(quest({ questType: 'one_time', scheduledDate: today, timeSet: false }), today)).toBe('Today, any time');
    expect(questScheduleLabel(quest({ questType: 'one_time', timeSet: false }), today)).toBe('Today, any time');
  });
  it('shows the date of a one-time quest that is not today', () => {
    expect(questScheduleLabel(quest({ questType: 'one_time', scheduledDate: '2026-11-01', time: '09:30' }), today)).toBe('Upcoming Nov 1 at 09:30');
  });
  it('does not call an archived one-time quest Today', () => {
    expect(questScheduleLabel(quest({ questType: 'one_time', archived: true, scheduledDate: today, time: '09:30' }), today)).toBe('Oct 5 at 09:30');
    expect(questScheduleLabel(quest({ questType: 'one_time', archived: true, timeSet: false }), today)).toBe('Past date, any time');
  });
  it('lists the days of a habit', () => {
    expect(questScheduleLabel(quest({ days: [1, 3], time: '08:00' }), today)).toBe('Mon, Wed at 08:00');
    expect(questScheduleLabel(quest({ days: [0, 1, 2, 3, 4, 5, 6], time: '08:00' }), today)).toBe('Every day at 08:00');
  });
});

describe('oneTimeTiming', () => {
  const today = '2026-10-05';
  const oneTime = (overrides: Partial<Quest> = {}) => quest({ questType: 'one_time', ...overrides });
  it('calls a null date undated, whatever the day', () => {
    expect(oneTimeTiming(oneTime({ scheduledDate: null }), today)).toBe('undated');
  });
  it('sorts a dated quest into today, upcoming or past', () => {
    expect(oneTimeTiming(oneTime({ scheduledDate: today }), today)).toBe('today');
    expect(oneTimeTiming(oneTime({ scheduledDate: '2026-10-06' }), today)).toBe('upcoming');
    expect(oneTimeTiming(oneTime({ scheduledDate: '2026-10-04' }), today)).toBe('past');
  });
  it('treats a quest whose date was never supplied as today (legacy fixtures and queued rows)', () => {
    expect(oneTimeTiming(oneTime(), today)).toBe('today');
  });
  it('falls back to today without an account date to compare against', () => {
    expect(oneTimeTiming(oneTime({ scheduledDate: '2026-10-06' }), undefined)).toBe('today');
    expect(oneTimeTiming(oneTime({ scheduledDate: null }), undefined)).toBe('undated');
  });
  it('compares the date keys across a month and a year boundary', () => {
    expect(oneTimeTiming(oneTime({ scheduledDate: '2026-11-01' }), '2026-10-31')).toBe('upcoming');
    expect(oneTimeTiming(oneTime({ scheduledDate: '2027-01-01' }), '2026-12-31')).toBe('upcoming');
    expect(oneTimeTiming(oneTime({ scheduledDate: '2026-12-31' }), '2027-01-01')).toBe('past');
  });
});

describe('questWhenLabel for dated one-time quests', () => {
  const today = '2026-10-05';
  const oneTime = (overrides: Partial<Quest> = {}) => quest({ questType: 'one_time', ...overrides });
  it('says No date for an undated quest and never shows a time for it', () => {
    expect(questWhenLabel(oneTime({ scheduledDate: null, timeSet: false }), today)).toBe('No date');
    expect(questWhenLabel(oneTime({ scheduledDate: null, timeSet: true, time: '09:30' }), today)).toBe('No date');
  });
  it('says Upcoming with the date, and the time when one is set', () => {
    expect(questWhenLabel(oneTime({ scheduledDate: '2026-10-12', timeSet: false }), today)).toBe('Upcoming Oct 12');
    expect(questWhenLabel(oneTime({ scheduledDate: '2026-10-12', timeSet: true, time: '09:30' }), today)).toBe('Upcoming Oct 12 09:30');
  });
  it('adds the year only when it differs from today', () => {
    expect(questWhenLabel(oneTime({ scheduledDate: '2027-01-02', timeSet: false }), today)).toBe('Upcoming Jan 2, 2027');
  });
  it('keeps Today for a quest dated today', () => {
    expect(questWhenLabel(oneTime({ scheduledDate: today, timeSet: true, time: '09:30' }), today)).toBe('Today 09:30');
  });
  it('formats a date key as a calendar date, so no device time zone can shift the day', () => {
    expect(questWhenLabel(oneTime({ scheduledDate: '2026-03-01', timeSet: false }), '2026-02-01')).toBe('Upcoming Mar 1');
  });
});

describe('questScheduleLabel for undated and upcoming quests', () => {
  const today = '2026-10-05';
  const oneTime = (overrides: Partial<Quest> = {}) => quest({ questType: 'one_time', ...overrides });
  it('says No date, not Today, for an undated quest', () => {
    expect(questScheduleLabel(oneTime({ scheduledDate: null, timeSet: false }), today)).toBe('No date');
  });
  it('formats the date of an upcoming quest, with the time when set', () => {
    expect(questScheduleLabel(oneTime({ scheduledDate: '2026-10-12', timeSet: true, time: '09:30' }), today)).toBe('Upcoming Oct 12 at 09:30');
    expect(questScheduleLabel(oneTime({ scheduledDate: '2026-10-12', timeSet: false }), today)).toBe('Upcoming Oct 12, any time');
  });
});

describe('recoveryDeadlineLabel', () => {
  it('falls back to the hours left when there is no deadline, and to 0 when even that is missing', () => {
    expect(recoveryDeadlineLabel(quest({ frozenHoursLeft: 5 }))).toBe('5h left');
    expect(recoveryDeadlineLabel(quest())).toBe('0h left');
  });
  it('shows the deadline in the account time zone', () => {
    const label = recoveryDeadlineLabel(quest({ recoveryDeadline: '2026-10-06T16:30:00Z', recoveryTimeZone: 'Asia/Manila' }));
    expect(label.startsWith('Until ')).toBe(true);
    expect(label).toContain('Oct 7');
    expect(label).toMatch(/12:30/);
  });
  it('shows a different clock time for a different zone', () => {
    const manila = recoveryDeadlineLabel(quest({ recoveryDeadline: '2026-10-06T16:30:00Z', recoveryTimeZone: 'Asia/Manila' }));
    const utc = recoveryDeadlineLabel(quest({ recoveryDeadline: '2026-10-06T16:30:00Z', recoveryTimeZone: 'UTC' }));
    expect(utc).not.toBe(manila);
    expect(utc).toContain('Oct 6');
  });
});
