import { splitQuestsByType, todayQuestsFilter } from '../quest-recurrence';
import { Quest } from '../../types/eiyu';

describe('todayQuestsFilter', () => {
  /** 2026-08-23 is a Sunday (UTC weekday 0); 08-24 is Monday (1). */
  const sundayNoon = new Date('2026-08-23T12:00:00.000Z');

  it('matches recurring habits by UTC weekday', () => {
    expect(todayQuestsFilter(sundayNoon)).toContain('and(quest_type.eq.habit,days.cs.{0})');
  });

  it('bounds one-time quests to the UTC creation day', () => {
    const filter = todayQuestsFilter(sundayNoon);
    expect(filter).toContain('created_at.gte.2026-08-23');
    expect(filter).toContain('created_at.lt.2026-08-24');
  });

  it('rolls the whole window over exactly at UTC midnight', () => {
    const justBefore = todayQuestsFilter(new Date('2026-08-23T23:59:59.999Z'));
    const justAfter = todayQuestsFilter(new Date('2026-08-24T00:00:00.000Z'));

    expect(justBefore).toContain('days.cs.{0}');
    expect(justBefore).toContain('gte.2026-08-23');
    expect(justBefore).toContain('lt.2026-08-24');

    expect(justAfter).toContain('days.cs.{1}');
    expect(justAfter).toContain('gte.2026-08-24');
    expect(justAfter).toContain('lt.2026-08-25');
  });
});

describe('splitQuestsByType', () => {
  const base: Quest = {
    id: '1', name: 'Test', stat: 'STR', difficulty: 'Medium',
    easyVersion: null, description: null, questType: 'habit', time: '08:00',
    days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false,
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