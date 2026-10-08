import { DAYS } from '../constants/eiyu-data';
import type { Quest } from '../types/eiyu';

/** The kind of a quest, as the quest form and the details view name it. */
export const QUEST_TYPE_LABEL = { habit: 'Habit', one_time: '1-Time', backlog: 'Backlog' } as const;

const daysLabel = (quest: Quest) => (quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', '));

export type OneTimeTiming = 'today' | 'undated' | 'upcoming' | 'past';

/**
 * Where a one-time quest sits relative to the account's today (a "YYYY-MM-DD" key, never the device clock).
 * A null date is undated; a date that was never supplied (older fixtures, queued rows) counts as today, and so
 * does any dated quest when there is no account date to compare against. An archived quest is always past.
 */
export function oneTimeTiming(quest: Quest, today?: string): OneTimeTiming {
  if (quest.archived) return 'past';
  if (quest.scheduledDate === null) return 'undated';
  if (!quest.scheduledDate || !today || quest.scheduledDate === today) return 'today';
  return quest.scheduledDate > today ? 'upcoming' : 'past';
}

/** "Oct 12", or "Jan 2, 2027" when the year differs from the account's today. A date key is a calendar date, so no zone shifts it. */
function dateKeyLabel(dateKey: string, today?: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const showYear = today !== undefined && year !== Number(today.slice(0, 4));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' as const } : {}),
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The short "when" on a quest card. Pass the account's today to get No date / Upcoming for one-time quests. */
export function questWhenLabel(quest: Quest, today?: string): string {
  if (quest.questType === 'backlog') return 'No date';
  if (quest.questType === 'one_time') {
    const timing = oneTimeTiming(quest, today);
    if (timing === 'undated') return 'No date';
    const time = quest.timeSet === false ? '' : ` ${quest.time}`;
    if (timing === 'upcoming') return `Upcoming ${dateKeyLabel(quest.scheduledDate!, today)}${time}`;
    if (timing === 'past' && quest.scheduledDate) return `${dateKeyLabel(quest.scheduledDate, today)}${time}`;
    return `Today${time}`;
  }
  return `${daysLabel(quest)} ${quest.time}`;
}

/** The longer schedule line in a quest's details. `today` is the account's current date key, never the device clock. */
export function questScheduleLabel(quest: Quest, today: string): string {
  if (quest.questType === 'backlog') return 'No date yet';
  if (quest.questType === 'one_time') {
    const timing = oneTimeTiming(quest, today);
    if (timing === 'undated') return 'No date';
    const when = timing === 'today' ? 'Today'
      : quest.scheduledDate ? `${timing === 'upcoming' ? 'Upcoming ' : ''}${dateKeyLabel(quest.scheduledDate, today)}`
        : 'Past date';
    return quest.timeSet === false ? `${when}, any time` : `${when} at ${quest.time}`;
  }
  return `${daysLabel(quest)} at ${quest.time}`;
}

/** How long a frozen streak can still be recovered: the deadline in the account's time zone, or the hours left. */
export function recoveryDeadlineLabel(quest: Quest): string {
  if (!quest.recoveryDeadline) return `${quest.frozenHoursLeft ?? 0}h left`;
  return `Until ${new Intl.DateTimeFormat(undefined, {
    timeZone: quest.recoveryTimeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(quest.recoveryDeadline))}`;
}
