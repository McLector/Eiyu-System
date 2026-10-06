import { accountDateKey, weekdayForDateKey } from './date-utils';
import { oneTimeTiming } from './quest-labels';
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

export interface BoardQuestSections {
  dailyQuests: Quest[];
  recoveryRequired: Quest[];
  oneTimeQuests: Quest[];
  allHabits: Quest[];
  archivedQuests: Quest[];
}

// Compare Unicode scalar values explicitly so device locale and Intl collation
// settings cannot reorder equal-time board cards between web and native.
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

function compareNameAndId(a: Quest, b: Quest): number {
  return compareCodePoints(a.name, b.name) || compareCodePoints(a.id, b.id);
}

/** A quest with no set time sorts after the ones that have one. */
function compareTimeSet(a: Quest, b: Quest): number {
  return Number(a.timeSet === false) - Number(b.timeSet === false);
}

function compareActionable(a: Quest, b: Quest): number {
  return Number(a.completed) - Number(b.completed)
    || compareTimeSet(a, b)
    || compareCodePoints(a.time, b.time)
    || compareNameAndId(a, b);
}

function compareCatalog(a: Quest, b: Quest): number {
  return compareTimeSet(a, b) || compareCodePoints(a.time, b.time) || compareNameAndId(a, b);
}

/**
 * Today's progress. Given the account's today, an upcoming one-time quest only counts once it is finished, so a
 * quest due next week does not inflate the total. Without it every board quest counts.
 */
export function boardTodayProgress(
  sections: Pick<BoardQuestSections, 'dailyQuests' | 'oneTimeQuests'>,
  today?: string
): { completed: number; total: number } {
  const countsToday = (quest: Quest) => !today || quest.completed || oneTimeTiming(quest, today) !== 'upcoming';
  const actionable = new Map(
    [...sections.dailyQuests, ...sections.oneTimeQuests].filter(countsToday).map(quest => [quest.id, quest])
  );
  return { completed: [...actionable.values()].filter(quest => quest.completed).length, total: actionable.size };
}

/** Today first, then undated, then upcoming by date. */
function oneTimeRank(quest: Quest, today: string): number {
  const timing = oneTimeTiming(quest, today);
  return timing === 'undated' ? 1 : timing === 'upcoming' ? 2 : 0;
}

function compareOneTimeLane(today?: string) {
  if (!today) return compareActionable;
  return (a: Quest, b: Quest): number => {
    const rank = oneTimeRank(a, today) - oneTimeRank(b, today);
    return Number(a.completed) - Number(b.completed)
      || rank
      || (oneTimeRank(a, today) === 2 ? compareCodePoints(a.scheduledDate ?? '', b.scheduledDate ?? '') : 0)
      || compareActionable(a, b);
  };
}

/** One shared routing contract for mobile and web board sections. Pass the account's today to order the One-time lane. */
export function partitionBoardQuests(quests: Quest[], today?: string): BoardQuestSections {
  const active = quests.filter(quest => !quest.archived);
  const dailyQuests = active
    .filter(quest => quest.questType === 'habit' && quest.dailyEligible === true)
    .sort(compareActionable);
  const oneTimeQuests = active
    .filter(quest => quest.questType === 'one_time')
    .sort(compareOneTimeLane(today));
  const allHabits = active
    .filter(quest => quest.questType === 'habit')
    .sort(compareCatalog);
  const archivedQuests = quests
    .filter(quest => quest.archived === true)
    .sort(compareNameAndId);
  return {
    dailyQuests,
    recoveryRequired: quests.filter(
      quest => quest.questType === 'habit' && quest.frozen && !quest.archived
    ).sort(compareActionable),
    oneTimeQuests,
    allHabits,
    archivedQuests,
  };
}
