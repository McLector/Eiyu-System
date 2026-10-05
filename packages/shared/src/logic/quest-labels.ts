import { DAYS } from '../constants/eiyu-data';
import type { Quest } from '../types/eiyu';

/** The kind of a quest, as the quest form and the details view name it. */
export const QUEST_TYPE_LABEL = { habit: 'Habit', one_time: 'One-time', backlog: 'Backlog' } as const;

const daysLabel = (quest: Quest) => (quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', '));

/** The short "when" on a quest card. */
export function questWhenLabel(quest: Quest): string {
  if (quest.questType === 'backlog') return 'No date';
  if (quest.questType === 'one_time') return quest.timeSet === false ? 'Today' : `Today ${quest.time}`;
  return `${daysLabel(quest)} ${quest.time}`;
}

/** The longer schedule line in a quest's details. `today` is the account's current date key, never the device clock. */
export function questScheduleLabel(quest: Quest, today: string): string {
  if (quest.questType === 'backlog') return 'No date yet';
  if (quest.questType === 'one_time') {
    const isToday = !quest.archived && (!quest.scheduledDate || quest.scheduledDate === today);
    const when = isToday ? 'Today' : quest.scheduledDate ?? 'Past date';
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
