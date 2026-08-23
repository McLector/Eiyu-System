import { todayQuestsFilter } from '../quest-recurrence';

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