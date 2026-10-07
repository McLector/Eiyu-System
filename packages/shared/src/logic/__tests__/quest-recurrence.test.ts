import { boardTodayProgress, partitionBoardQuests, splitQuestsByType, todayQuestsFilter } from '../quest-recurrence';
import { Quest } from '../../types/eiyu';

describe('todayQuestsFilter', () => {
  /** 2026-08-23 is a Sunday (UTC weekday 0); 08-24 is Monday (1). */
  const sundayNoon = new Date('2026-08-23T12:00:00.000Z');

  it('matches recurring habits by the persisted account timezone weekday', () => {
    expect(todayQuestsFilter(sundayNoon, 'UTC')).toContain('and(quest_type.eq.habit,days.cs.{0})');
  });

  it('matches one-time quests by scheduled_date equality, not a created_at range', () => {
    const filter = todayQuestsFilter(sundayNoon, 'UTC');
    expect(filter).toContain('and(quest_type.eq.one_time,scheduled_date.eq.2026-08-23)');
    expect(filter).not.toContain('created_at');
  });

  it('rolls the whole window over exactly at UTC midnight', () => {
    const justBefore = todayQuestsFilter(new Date('2026-08-23T23:59:59.999Z'), 'UTC');
    const justAfter = todayQuestsFilter(new Date('2026-08-24T00:00:00.000Z'), 'UTC');

    expect(justBefore).toContain('days.cs.{0}');
    expect(justBefore).toContain('scheduled_date.eq.2026-08-23');

    expect(justAfter).toContain('days.cs.{1}');
    expect(justAfter).toContain('scheduled_date.eq.2026-08-24');
  });

  it('rolls over at local midnight in the persisted IANA timezone', () => {
    const beforeManilaMidnight = todayQuestsFilter(new Date('2026-08-23T15:59:59.999Z'), 'Asia/Manila');
    const afterManilaMidnight = todayQuestsFilter(new Date('2026-08-23T16:00:00.000Z'), 'Asia/Manila');

    expect(beforeManilaMidnight).toContain('scheduled_date.eq.2026-08-23');
    expect(afterManilaMidnight).toContain('scheduled_date.eq.2026-08-24');
  });
});

describe('partitionBoardQuests', () => {
  const base: Quest = {
    id: '1', name: 'Test', stat: 'STR', difficulty: 'Medium',
    easyVersion: 'Do one minute', description: null, questType: 'habit', time: '08:00',
    days: [1, 3, 5], streak: 0, frozen: false, completed: false,
    targetCount: null, progressCount: 0,
  };

  it('routes one mixed dataset into distinct board sections without duplicating state', () => {
    const daily = { ...base, id: 'daily', dailyEligible: true };
    const offDay = { ...base, id: 'off-day', dailyEligible: false };
    const recovery = { ...base, id: 'recovery', dailyEligible: false, frozen: true };
    const oneTime = {
      ...base, id: 'one-time', questType: 'one_time' as const,
      dailyEligible: true, easyVersion: null,
    };
    const archived = { ...base, id: 'archived', dailyEligible: false, archived: true } as Quest;

    const sections = partitionBoardQuests([daily, offDay, recovery, oneTime, archived]);

    expect(sections.dailyQuests.map(q => q.id)).toEqual(['daily']);
    expect(sections.recoveryRequired.map(q => q.id)).toEqual(['recovery']);
    expect(sections.oneTimeQuests.map(q => q.id)).toEqual(['one-time']);
    expect(sections.allHabits.map(q => q.id)).toEqual(['daily', 'off-day', 'recovery']);
    expect(sections.archivedQuests.map(q => q.id)).toEqual(['archived']);
    expect(sections.allHabits[0]).toBe(sections.dailyQuests[0]);
  });

  it('keeps an off-day M/W/F habit in All Habits but out of Daily Quests', () => {
    const offDay = { ...base, id: 'mwf-tuesday', dailyEligible: false };
    const sections = partitionBoardQuests([offDay]);
    expect(sections.dailyQuests).toEqual([]);
    expect(sections.allHabits).toEqual([offDay]);
  });

  it('never includes a one-time quest in Daily Quests or All Habits', () => {
    const oneTime = {
      ...base, id: 'one-time', questType: 'one_time' as const,
      dailyEligible: true, easyVersion: null,
    };
    const sections = partitionBoardQuests([oneTime]);
    expect(sections.dailyQuests).toEqual([]);
    expect(sections.allHabits).toEqual([]);
    expect(sections.oneTimeQuests).toEqual([oneTime]);
    expect(sections.archivedQuests).toEqual([]);
  });

  it('sorts an untimed One-time quest after timed ones, then by name', () => {
    const timed = { ...base, id: 't', name: 'Zeta', questType: 'one_time' as const, time: '09:00', timeSet: true };
    const untimedEarly = { ...base, id: 'u', name: 'Alpha', questType: 'one_time' as const, time: '08:00', timeSet: false };
    const untimedLate = { ...base, id: 'v', name: 'Beta', questType: 'one_time' as const, time: '08:00', timeSet: false };
    const { oneTimeQuests } = partitionBoardQuests([untimedLate, timed, untimedEarly]);
    expect(oneTimeQuests.map(q => q.id)).toEqual(['t', 'u', 'v']);
  });

  it('keeps Backlog quests out of every board section', () => {
    const backlog = { ...base, id: 'b', questType: 'backlog' as const, days: [], dailyEligible: false };
    const sections = partitionBoardQuests([backlog]);
    expect([...sections.dailyQuests, ...sections.oneTimeQuests, ...sections.allHabits, ...sections.recoveryRequired, ...sections.archivedQuests]).toEqual([]);
  });
});

describe('one-time lane with undated and upcoming quests', () => {
  const today = '2026-10-05';
  const make = (id: string, over: Partial<Quest> = {}): Quest => ({
    id, name: id, stat: 'STR', difficulty: 'Medium', easyVersion: null, description: null,
    questType: 'one_time', time: '08:00', days: [], streak: 0, frozen: false, completed: false,
    targetCount: null, progressCount: 0, timeSet: false, ...over,
  });

  it('orders unfinished quests today, then undated, then upcoming by date, finished last', () => {
    const quests = [
      make('far', { scheduledDate: '2026-10-20' }),
      make('done', { scheduledDate: today, completed: true }),
      make('undated', { scheduledDate: null }),
      make('near', { scheduledDate: '2026-10-07' }),
      make('now', { scheduledDate: today }),
    ];
    expect(partitionBoardQuests(quests, today).oneTimeQuests.map(q => q.id))
      .toEqual(['now', 'undated', 'near', 'far', 'done']);
  });

  it('keeps the time then name order inside a group', () => {
    const quests = [
      make('b-late', { scheduledDate: today, timeSet: true, time: '20:00' }),
      make('a-early', { scheduledDate: today, timeSet: true, time: '07:00' }),
      make('untimed', { scheduledDate: today }),
    ];
    expect(partitionBoardQuests(quests, today).oneTimeQuests.map(q => q.id))
      .toEqual(['a-early', 'b-late', 'untimed']);
  });

  it('behaves as before when no account date is given', () => {
    const quests = [make('b', { scheduledDate: '2026-10-20' }), make('a', { scheduledDate: null })];
    expect(partitionBoardQuests(quests).oneTimeQuests.map(q => q.id)).toEqual(['a', 'b']);
  });

  it('does not count an open upcoming quest toward today, but counts it once finished', () => {
    const sections = (completed: boolean) => partitionBoardQuests([
      make('today', { scheduledDate: today }),
      make('undated', { scheduledDate: null }),
      make('later', { scheduledDate: '2026-10-09', completed }),
    ], today);
    expect(boardTodayProgress(sections(false), today)).toEqual({ completed: 0, total: 2 });
    expect(boardTodayProgress(sections(true), today)).toEqual({ completed: 1, total: 3 });
  });

  it('counts every one-time quest when no account date is given (legacy callers)', () => {
    const s = partitionBoardQuests([make('x', { scheduledDate: '2026-10-09' })]);
    expect(boardTodayProgress(s)).toEqual({ completed: 0, total: 1 });
  });

  it('counts a quest that is in both lists once', () => {
    const q = make('dup', { scheduledDate: today, completed: true });
    expect(boardTodayProgress({ dailyQuests: [q], oneTimeQuests: [q] }, today)).toEqual({ completed: 1, total: 1 });
  });
});

describe('splitQuestsByType', () => {
  const base: Quest = {
    id: '1', name: 'Test', stat: 'STR', difficulty: 'Medium',
    easyVersion: null, description: null, questType: 'habit', time: '08:00',
    days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false,
    targetCount: null, progressCount: 0,
  };

  it('splits habits and one-time quests into separate groups, preserving order', () => {
    const quests: Quest[] = [
      { ...base, id: 'h1', questType: 'habit' },
      { ...base, id: 'o1', questType: 'one_time' },
      { ...base, id: 'h2', questType: 'habit' },
      { ...base, id: 'o2', questType: 'one_time' },
    ];
    const { habitQuests, oneTimeQuests } = splitQuestsByType(quests);
    expect(habitQuests.map(q => q.id)).toEqual(['h1', 'h2']);
    expect(oneTimeQuests.map(q => q.id)).toEqual(['o1', 'o2']);
  });

  it('returns empty arrays for an empty input', () => {
    expect(splitQuestsByType([])).toEqual({ habitQuests: [], oneTimeQuests: [] });
  });

  it('puts everything in habitQuests when there are no one-time quests', () => {
    const quests: Quest[] = [{ ...base, id: 'h1' }];
    expect(splitQuestsByType(quests)).toEqual({ habitQuests: quests, oneTimeQuests: [] });
  });
});

describe('manual order in the board lanes', () => {
  const make = (id: string, over: Partial<Quest> = {}): Quest => ({
    id, name: id, stat: 'STR', difficulty: 'Medium', easyVersion: 'less', description: null,
    questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false,
    targetCount: null, progressCount: 0, timeSet: true, dailyEligible: true, ...over,
  });
  const today = '2026-10-05';

  it('orders Daily by position instead of time once every row has one', () => {
    const quests = [make('late', { time: '20:00', position: 0 }), make('early', { time: '06:00', position: 1 })];
    expect(partitionBoardQuests(quests).dailyQuests.map(q => q.id)).toEqual(['late', 'early']);
  });

  it('still sinks finished Daily quests below the unfinished ones', () => {
    const quests = [make('done', { completed: true, position: 0 }), make('b', { position: 2 }), make('a', { position: 1 })];
    expect(partitionBoardQuests(quests).dailyQuests.map(q => q.id)).toEqual(['a', 'b', 'done']);
  });

  it('orders One-time by position, ignoring due date and time, with finished last', () => {
    const one = (id: string, over: Partial<Quest>) => make(id, { questType: 'one_time', days: [], easyVersion: null, timeSet: false, ...over });
    const quests = [
      one('later', { scheduledDate: '2026-10-20', position: 0 }),
      one('now', { scheduledDate: today, position: 1 }),
      one('done', { scheduledDate: today, completed: true, position: -5 }),
      one('undated', { scheduledDate: null, position: 2 }),
    ];
    expect(partitionBoardQuests(quests, today).oneTimeQuests.map(q => q.id)).toEqual(['later', 'now', 'undated', 'done']);
  });

  it('breaks position ties by id', () => {
    const quests = [make('b', { position: 0 }), make('a', { position: 0 })];
    expect(partitionBoardQuests(quests).dailyQuests.map(q => q.id)).toEqual(['a', 'b']);
  });

  it('falls back to the automatic order for a lane where a quest has no position', () => {
    const quests = [make('late', { time: '20:00', position: 0 }), make('early', { time: '06:00' })];
    expect(partitionBoardQuests(quests).dailyQuests.map(q => q.id)).toEqual(['early', 'late']);
  });

  it('judges each lane on its own rows', () => {
    const one = make('one', { questType: 'one_time', days: [], easyVersion: null, scheduledDate: today });
    const quests = [make('late', { time: '20:00', position: 0 }), make('early', { time: '06:00', position: 1 }), one];
    const sections = partitionBoardQuests(quests, today);
    expect(sections.dailyQuests.map(q => q.id)).toEqual(['late', 'early']);
    expect(sections.oneTimeQuests.map(q => q.id)).toEqual(['one']);
  });

  it('leaves All Habits and Recovery on their automatic order', () => {
    const quests = [make('late', { time: '20:00', position: 0 }), make('early', { time: '06:00', position: 1 })];
    expect(partitionBoardQuests(quests).allHabits.map(q => q.id)).toEqual(['early', 'late']);
  });
});
