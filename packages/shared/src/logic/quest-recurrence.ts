import { addUtcDays, toDateKey } from './date-utils';
import { Quest } from '../types/eiyu';

/**
 * PostgREST filter selecting what appears on TODAY's board (UTC-day math,
 * consistent with completed_on and streakState):
 * - recurring habits whose days array contains today's UTC weekday;
 * - one-time quests created today.
 *
 * The explicit created_at window is the recurrence guard - without it a
 * one-time row carrying the default days = [0..6] would reappear every day.
 * Extracted as a pure function so the day-boundary logic stays unit-tested
 * (see __tests__/quest-recurrence.test.ts).
 *
 * Known tradeoff (Phase 4 review): "today" is a UTC day here, matching the
 * rest of the app (completed_on keys, streak day-of-week math). A non-UTC
 * user's one-time quest can therefore vanish a few hours before their local
 * midnight or linger past it. Kept UTC for consistency - switching one-time
 * quests alone to local-day while completions stay UTC-keyed would create
 * worse mismatches (visible quest whose completion lands on the wrong date).
 * Revisit only as part of a broader local-day refactor of completed_on.
 */
export function todayQuestsFilter(now: Date): string {
  const dayOfWeek = now.getUTCDay();
  const todayStr = toDateKey(now);
  const tomorrowStr = toDateKey(addUtcDays(now, 1));
  return (
    `and(quest_type.eq.habit,days.cs.{${dayOfWeek}}),` +
    `and(quest_type.eq.one_time,created_at.gte.${todayStr},created_at.lt.${tomorrowStr})`
  );
}

/** Splits a fetched quest list into habit-quests and one-time-quests for the board's two-section layout. */
export function splitQuestsByType(quests: Quest[]): { habitQuests: Quest[]; oneTimeQuests: Quest[] } {
  return {
    habitQuests: quests.filter(q => q.questType === 'habit'),
    oneTimeQuests: quests.filter(q => q.questType === 'one_time'),
  };
}