import { STATS } from '../constants/eiyu-data';
import { addUtcDays, startOfUtcDay, toDateKey } from './date-utils';
import { Quest, Rank, Stat, StatData } from '../types/eiyu';

// R-21: full completion = 100% of the base award, easy/recovery = ~20%.
export const FULL_XP = 20;
export const EASY_XP = 4;

const BASE_LEVEL_XP = 100;
const LEVEL_XP_GROWTH = 25;

export interface LevelProgress {
  level: number;
  /** XP earned within the current level (not cumulative since level 1). */
  xpIntoLevel: number;
  /** XP required to complete the current level. */
  xpForNextLevel: number;
}

/**
 * Level curve: level N costs 100 + (N-1)*25 XP, cumulative. xp is total XP
 * ever earned for the stat; this walks the curve to find level + progress.
 */
export function levelProgress(xp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, xp);
  let cost = BASE_LEVEL_XP;
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost += LEVEL_XP_GROWTH;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: cost };
}

export function levelFromXp(xp: number): number {
  return levelProgress(xp).level;
}

const RANK_THRESHOLDS: [Rank, number][] = [
  ['S', 40],
  ['A', 30],
  ['B', 20],
  ['C', 10],
  ['D', 5],
  ['E', 0],
];

/** R-23: overall Rank derived from the average level across all 5 stats. */
export function rankFromAverageLevel(avgLevel: number): Rank {
  for (const [rank, threshold] of RANK_THRESHOLDS) {
    if (avgLevel >= threshold) return rank;
  }
  return 'E';
}

export function rankFromStats(stats: Record<Stat, StatData>): Rank {
  const avg = STATS.reduce((sum, stat) => sum + stats[stat].level, 0) / STATS.length;
  return rankFromAverageLevel(avg);
}

/**
 * R-30: the stat targeted by this week's auto-generated Weekly Quest — the
 * lowest level, tie-broken by lowest xp-into-level, then alphabetically so
 * the result is deterministic rather than depending on iteration order.
 */
export function weakestStat(stats: Record<Stat, StatData>): Stat {
  return STATS.reduce((weakest, stat) => {
    const a = stats[stat];
    const b = stats[weakest];
    if (a.level !== b.level) return a.level < b.level ? stat : weakest;
    if (a.xp !== b.xp) return a.xp < b.xp ? stat : weakest;
    return stat < weakest ? stat : weakest;
  }, STATS[0]);
}

/**
 * R-10: consecutive-day streak count. Walks backward day by day from today;
 * only days the habit is scheduled on count. Today not being completed yet
 * doesn't break the streak (it's still in progress). Any other scheduled day
 * with no completion breaks it.
 *
 * This is the plain "hasn't missed a day" streak — freeze/recovery grace
 * (R-11-R-15) is layered on top of this by streakState below.
 */
export function currentStreak(
  scheduledDays: number[],
  completedDates: Set<string>,
  today: Date = new Date()
): number {
  let streak = 0;
  let cursor = today;
  const todayKey = toDateKey(today);
  const scheduled = new Set(scheduledDays);

  for (let i = 0; i < 3650; i++) {
    const dow = cursor.getUTCDay();
    if (scheduled.has(dow)) {
      const key = toDateKey(cursor);
      if (completedDates.has(key)) {
        streak += 1;
      } else if (key !== todayKey) {
        break;
      }
      // key === todayKey and not completed: neutral, keep walking backward
    }
    cursor = addUtcDays(cursor, -1);
  }
  return streak;
}

/**
 * Walks backward from yesterday to find the earliest scheduled day in the
 * current unbroken run of misses (i.e. the day that actually broke the
 * streak) — stops at the first completed day, or at `sinceDate` so a habit
 * can never be judged "missed" on a day before it existed.
 */
function findFirstMiss(
  scheduledDays: number[],
  completedDates: Set<string>,
  today: Date,
  sinceDate: Date
): Date | null {
  const scheduled = new Set(scheduledDays);
  let cursor = today;
  let firstMiss: Date | null = null;

  for (let i = 0; i < 366; i++) {
    cursor = addUtcDays(cursor, -1);
    if (cursor.getTime() < sinceDate.getTime()) break;
    if (!scheduled.has(cursor.getUTCDay())) continue;
    if (completedDates.has(toDateKey(cursor))) break;
    firstMiss = cursor;
  }
  return firstMiss;
}

export interface StreakState {
  current: number;
  state: 'active' | 'frozen' | 'broken';
  /** the missed scheduled date, only set when frozen (R-12) */
  frozenDate?: string;
  /** hours left in the 24h recovery window, only set when frozen (R-12) */
  frozenHoursLeft?: number;
}

/**
 * R-11-R-14: layers freeze/recovery grace on top of currentStreak.
 *
 * Finds the earliest missed scheduled day since the last completion (or
 * since the habit was created). If there isn't one, the streak is plain
 * "active". If there is, the calendar day right after that miss is a 24h
 * recovery window — frozen during that day, holding the streak as of right
 * before the miss. Once the window lapses without a (possibly backdated)
 * completion for that missed date, the streak is 'broken' and resets to 0
 * (R-14) — and stays broken regardless of any later misses, rather than
 * re-freezing on every subsequent missed day.
 */
export function streakState(
  scheduledDays: number[],
  completedDates: Set<string>,
  now: Date = new Date(),
  habitCreatedAt: Date = new Date(0)
): StreakState {
  const today = startOfUtcDay(now);
  const sinceDate = startOfUtcDay(habitCreatedAt);
  const firstMiss = findFirstMiss(scheduledDays, completedDates, today, sinceDate);

  if (!firstMiss) {
    return { current: currentStreak(scheduledDays, completedDates, now), state: 'active' };
  }

  const daysSinceMiss = Math.round((today.getTime() - firstMiss.getTime()) / 86_400_000);

  if (daysSinceMiss === 1) {
    const deadline = addUtcDays(firstMiss, 2); // midnight ending the recovery day
    const hoursLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 3_600_000));
    return {
      current: currentStreak(scheduledDays, completedDates, firstMiss),
      state: 'frozen',
      frozenDate: toDateKey(firstMiss),
      frozenHoursLeft: Math.min(24, hoursLeft),
    };
  }

  return { current: 0, state: 'broken' };
}

/**
 * Every quest currently in a frozen (not-yet-recovered) streak state.
 * A board can have more than one at once — each habit computes its own
 * streakState independently (see habits.ts's toQuest) — so this must
 * return all of them, not `.find()` the first.
 */
export function frozenQuests(quests: Quest[]): Quest[] {
  return quests.filter(q => q.frozen && !q.completed);
}
