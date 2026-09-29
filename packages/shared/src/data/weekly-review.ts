import { STATS } from '../constants/eiyu-data';
import { accountDateKey, addDateKeyDays, weekdayForDateKey } from '../logic/date-utils';
import { Stat } from '../types/eiyu';
import { fetchHistoryEvidence } from './history';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type WeeklyDayDatum = { dateKey: string; day: string } & Record<Stat, number>;

function emptyDayCounts(): Record<Stat, number> {
  return { STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 0 };
}

/** Completions per stat per day for the last 7 days (today inclusive), for the Weekly Review tab. */
export async function fetchWeeklyReview(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<WeeklyDayDatum[]> {
  const todayKey = accountDateKey(now, timeZone);
  const startStr = addDateKeyDays(todayKey, -6);

  const snapshot = await fetchHistoryEvidence(startStr, addDateKeyDays(todayKey, 1));

  const buckets = new Map<string, Record<Stat, number>>();
  for (let i = 0; i < 7; i++) {
    buckets.set(addDateKeyDays(startStr, i), emptyDayCounts());
  }

  for (const row of snapshot.rows) {
    if (!row.completion_kind) continue;
    const bucket = buckets.get(row.historical_date);
    if (!bucket) continue;
    bucket[row.stat] += 1;
  }

  return Array.from(buckets.entries()).map(([dateKey, counts]) => ({
    dateKey,
    day: DAY_LABELS[weekdayForDateKey(dateKey)],
    ...counts,
  }));
}

export function weeklyStatTotal(data: WeeklyDayDatum[], stat: Stat): number {
  return data.reduce((sum, d) => sum + d[stat], 0);
}

export function weeklyDayTotal(day: WeeklyDayDatum): number {
  return STATS.reduce((sum, stat) => sum + day[stat], 0);
}
