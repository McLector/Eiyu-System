import { accountDateKey, weekdayForDateKey } from './date-utils';
import { Quest } from '../types/eiyu';

/**
 * PostgREST filter selecting what appears on TODAY's board in the persisted
 * account timezone:
 * - recurring habits whose days array contains today's account weekday;
 * - one-time quests scheduled for today (an explicit, user-set date, not
 *   just "created today" — Slice 4).
 *
 * Extracted as a pure function so the day-boundary logic stays unit-tested
 * (see __tests__/quest-recurrence.test.ts).
 *
 * The timezone is an account value rather than a device-local setting, so
 * mobile and web produce the same date key even when opened in different zones.
 */
export function todayQuestsFilter(now: Date, timeZone: string): string {
  const todayStr = accountDateKey(now, timeZone);
  const dayOfWeek = weekdayForDateKey(todayStr);
  return (
    `and(quest_type.eq.habit,days.cs.{${dayOfWeek}}),` +
    `and(quest_type.eq.one_time,scheduled_date.eq.${todayStr})`
  );
}

/** Splits a fetched quest list into habit-quests and one-time-quests for the board's two-section layout. */
export function splitQuestsByType(quests: Quest[]): { habitQuests: Quest[]; oneTimeQuests: Quest[] } {
  return {
    habitQuests: quests.filter(q => q.questType === 'habit'),
    oneTimeQuests: quests.filter(q => q.questType === 'one_time'),
  };
}
