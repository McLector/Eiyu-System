import { partitionBoardQuests, splitQuestsByType, todayQuestsFilter } from '../quest-recurrence';
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
    expect(sections.allHabits.map(q => q.id)).toEqual(['daily', 'off-day', 'recovery', 'archived']);
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
