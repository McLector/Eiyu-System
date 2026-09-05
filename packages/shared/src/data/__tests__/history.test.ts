import { fetchMonthHistory } from '../history';
import { supabase } from '../../supabase/client';

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn() },
}));

const YEAR = 2026;
const MONTH = 8; // September (0-indexed) — 30 days, no DST edge cases

function weekdayOf(day: number): number {
  return new Date(Date.UTC(YEAR, MONTH, day)).getUTCDay();
}

function mockTables(habitsData: unknown[], completionsData: unknown[]) {
  const habitsBuilder: any = {
    select: jest.fn(() => habitsBuilder),
    eq: jest.fn(() => Promise.resolve({ data: habitsData, error: null })),
  };
  const completionsBuilder: any = {
    select: jest.fn(() => completionsBuilder),
    eq: jest.fn(() => completionsBuilder),
    gte: jest.fn(() => completionsBuilder),
    lt: jest.fn(() => Promise.resolve({ data: completionsData, error: null })),
  };
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'habits') return habitsBuilder;
    if (table === 'habit_completions') return completionsBuilder;
    throw new Error(`unexpected table ${table}`);
  });
}

describe('fetchMonthHistory', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('returns a dense entry for every day of the month, not just days with completions', async () => {
    mockTables([], []);
    const result = await fetchMonthHistory('user-1', YEAR, MONTH);
    expect(Object.keys(result)).toHaveLength(30);
    expect(result['2026-09-01']).toEqual({ completions: [], completedCount: 0, scheduledCount: 0 });
  });

  it('scheduledCount counts only non-archived, recurring habits whose days mask includes that date\'s weekday', async () => {
    const day = 10;
    const weekday = weekdayOf(day);
    const otherWeekday = (weekday + 1) % 7;
    mockTables(
      [
        { id: 'h1', name: 'Matches today', quest_type: 'habit', days: [weekday], archived: false },
        { id: 'h2', name: 'Different day', quest_type: 'habit', days: [otherWeekday], archived: false },
        { id: 'h3', name: 'Archived match', quest_type: 'habit', days: [weekday], archived: true },
        { id: 'h4', name: 'One-time match', quest_type: 'one_time', days: [0, 1, 2, 3, 4, 5, 6], archived: false },
      ],
      []
    );
    const result = await fetchMonthHistory('user-1', YEAR, MONTH);
    const key = `2026-09-${String(day).padStart(2, '0')}`;
    expect(result[key].scheduledCount).toBe(1);
  });

  it('completedCount only counts completions whose habit is in the current scheduled set (bounds ratio to <=1); completions list stays unfiltered', async () => {
    const day = 15;
    const weekday = weekdayOf(day);
    const dateKey = `2026-09-${String(day).padStart(2, '0')}`;
    mockTables(
      [
        { id: 'h1', name: 'Active', quest_type: 'habit', days: [weekday], archived: false },
        { id: 'h2', name: 'Since archived', quest_type: 'habit', days: [weekday], archived: true },
      ],
      [
        { habit_id: 'h1', completed_on: dateKey, kind: 'full' },
        { habit_id: 'h2', completed_on: dateKey, kind: 'full' },
      ]
    );
    const result = await fetchMonthHistory('user-1', YEAR, MONTH);
    expect(result[dateKey].scheduledCount).toBe(1);
    expect(result[dateKey].completedCount).toBe(1);
    expect(result[dateKey].completions).toHaveLength(2);
    expect(result[dateKey].completions.map(c => c.habitName).sort()).toEqual(['Active', 'Since archived']);
  });

  it('a day with no matching habits has scheduledCount 0', async () => {
    const day = 20;
    const weekday = weekdayOf(day);
    const otherWeekday = (weekday + 1) % 7;
    mockTables([{ id: 'h1', name: 'Never today', quest_type: 'habit', days: [otherWeekday], archived: false }], []);
    const result = await fetchMonthHistory('user-1', YEAR, MONTH);
    const key = `2026-09-${String(day).padStart(2, '0')}`;
    expect(result[key].scheduledCount).toBe(0);
    expect(result[key].completedCount).toBe(0);
  });
});
