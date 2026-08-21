import {
  currentStreak,
  EASY_XP,
  FULL_XP,
  levelFromXp,
  levelProgress,
  rankFromAverageLevel,
  rankFromStats,
  streakState,
} from '@/lib/eiyu-logic';
import { StatData } from '@/types/eiyu';

describe('levelProgress', () => {
  it('starts at level 1 with 0 xp', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
  });

  it('stays level 1 until the first threshold', () => {
    expect(levelProgress(99).level).toBe(1);
  });

  it('levels up exactly at the threshold', () => {
    expect(levelProgress(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 125 });
  });

  it('accumulates through multiple levels with growing costs', () => {
    // level1 costs 100, level2 costs 125 -> 225 total to reach level 3
    expect(levelProgress(225).level).toBe(3);
    expect(levelProgress(224).level).toBe(2);
  });

  it('never returns a level below 1 for negative input', () => {
    expect(levelProgress(-50)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
  });
});

describe('levelFromXp', () => {
  it('matches levelProgress().level', () => {
    expect(levelFromXp(340)).toBe(levelProgress(340).level);
  });
});

describe('XP award constants', () => {
  it('easy award is roughly 20% of full award (R-21)', () => {
    expect(EASY_XP / FULL_XP).toBeCloseTo(0.2, 1);
  });
});

describe('rankFromAverageLevel', () => {
  it.each([
    [0, 'E'],
    [4.9, 'E'],
    [5, 'D'],
    [9.9, 'D'],
    [10, 'C'],
    [19.9, 'C'],
    [20, 'B'],
    [29.9, 'B'],
    [30, 'A'],
    [39.9, 'A'],
    [40, 'S'],
    [100, 'S'],
  ] as const)('%d average level -> rank %s', (avg, expected) => {
    expect(rankFromAverageLevel(avg)).toBe(expected);
  });
});

describe('rankFromStats', () => {
  it('derives rank from the average of all 5 stat levels', () => {
    const stat = (level: number): StatData => ({ level, xp: 0, xpMax: 100 });
    const stats = { STR: stat(10), INT: stat(10), DEX: stat(10), WIS: stat(10), CHA: stat(10) };
    expect(rankFromStats(stats)).toBe('C');
  });
});

describe('currentStreak', () => {
  const day = (offsetFromToday: number, today: Date) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetFromToday);
    return d.toISOString().slice(0, 10);
  };

  it('is 0 with no completions', () => {
    const today = new Date('2026-08-21T12:00:00Z'); // Friday
    expect(currentStreak([0, 1, 2, 3, 4, 5, 6], new Set(), today)).toBe(0);
  });

  it('counts consecutive scheduled days ending yesterday when today is not done yet', () => {
    const today = new Date('2026-08-21T12:00:00Z'); // Friday
    const completed = new Set([day(-1, today), day(-2, today), day(-3, today)]);
    expect(currentStreak([0, 1, 2, 3, 4, 5, 6], completed, today)).toBe(3);
  });

  it('includes today when already completed', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const completed = new Set([day(0, today), day(-1, today)]);
    expect(currentStreak([0, 1, 2, 3, 4, 5, 6], completed, today)).toBe(2);
  });

  it('breaks on a missed scheduled day (not today)', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const completed = new Set([day(-1, today), day(-3, today)]); // gap at day -2
    expect(currentStreak([0, 1, 2, 3, 4, 5, 6], completed, today)).toBe(1);
  });

  it('only counts scheduled days of week, skipping unscheduled ones', () => {
    const today = new Date('2026-08-21T12:00:00Z'); // Friday
    // scheduled only Mon/Wed/Fri; completed the last 3 scheduled occurrences
    const completed = new Set([day(0, today), day(-2, today), day(-4, today)]);
    expect(currentStreak([1, 3, 5], completed, today)).toBe(3);
  });
});

describe('streakState', () => {
  const day = (offsetFromToday: number, today: Date) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetFromToday);
    return d.toISOString().slice(0, 10);
  };
  const DAILY = [0, 1, 2, 3, 4, 5, 6];

  it('is active when yesterday was completed', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const completed = new Set([day(-1, today), day(-2, today)]);
    const result = streakState(DAILY, completed, today);
    expect(result.state).toBe('active');
    expect(result.current).toBe(2);
  });

  it('is active with no completions and no prior scheduled day', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const result = streakState([], new Set(), today);
    expect(result.state).toBe('active');
    expect(result.current).toBe(0);
  });

  it('freezes when yesterday was missed, preserving the pre-miss streak (R-11)', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    // streak of 3 ending two days ago, then a gap yesterday
    const completed = new Set([day(-2, today), day(-3, today), day(-4, today)]);
    const result = streakState(DAILY, completed, today);
    expect(result.state).toBe('frozen');
    expect(result.current).toBe(3);
    expect(result.frozenDate).toBe(day(-1, today));
  });

  it('gives a 24h-or-less recovery window that counts down (R-12)', () => {
    const today = new Date('2026-08-21T01:00:00Z'); // just after midnight
    const completed = new Set([day(-2, today)]);
    const result = streakState(DAILY, completed, today);
    expect(result.state).toBe('frozen');
    expect(result.frozenHoursLeft).toBeLessThanOrEqual(24);
    expect(result.frozenHoursLeft).toBeGreaterThan(0);

    const laterToday = new Date('2026-08-21T20:00:00Z'); // near end of the recovery day
    const laterResult = streakState(DAILY, completed, laterToday);
    expect(laterResult.frozenHoursLeft).toBeLessThan(result.frozenHoursLeft!);
  });

  it('breaks and resets to 0 once the recovery window has lapsed (R-14)', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    // missed two days ago; the one recovery day (yesterday) already passed
    const completed = new Set([day(-3, today)]);
    const result = streakState(DAILY, completed, today);
    expect(result.state).toBe('broken');
    expect(result.current).toBe(0);
  });

  it('is active for a brand-new habit, never frozen for days before it existed', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const createdAt = today; // habit created today, no completions yet
    const result = streakState(DAILY, new Set(), today, createdAt);
    expect(result.state).toBe('active');
    expect(result.current).toBe(0);
  });

  it('returns to active once the missed date gets a backdated completion (R-13)', () => {
    const today = new Date('2026-08-21T12:00:00Z');
    const completed = new Set([day(-2, today), day(-3, today)]);
    const frozen = streakState(DAILY, completed, today);
    expect(frozen.state).toBe('frozen');

    // recovery quest completed: backdate a completion for the missed day
    completed.add(frozen.frozenDate!);
    const recovered = streakState(DAILY, completed, today);
    expect(recovered.state).toBe('active');
    expect(recovered.current).toBeGreaterThan(0);
  });
});
