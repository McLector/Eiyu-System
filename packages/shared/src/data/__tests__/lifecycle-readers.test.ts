import { fetchWeeklyReview, weeklyStatTotal } from '../weekly-review';
import { fetchOrCreateWeeklyQuest } from '../weekly-quest';
import { gatherWeekData } from '../weekly-summary';
import { supabase } from '../../supabase/client';
import { Stat, StatData } from '../../types/eiyu';

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

function chainable(result: { data?: unknown; count?: number | null; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    in: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    lt: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe('lifecycle readers', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    (supabase.rpc as jest.Mock).mockReset();
  });

  it('includes deleted completions in the weekly review stat totals', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { habits: [], recurring_totals: {}, rows: [
      { source_habit_id: 'live-1', historical_date: '2026-09-16', habit_name: 'Live', stat: 'STR', quest_type: 'habit', scheduled: true, completion_kind: 'full' },
      { source_habit_id: 'deleted-1', historical_date: '2026-09-17', habit_name: 'Deleted', stat: 'INT', quest_type: 'habit', scheduled: true, completion_kind: 'easy' },
    ] }, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: [{ id: 'live-1', stat: 'STR' }], error: null });
      if (table === 'habit_completions') {
        return chainable({ data: [{ habit_id: 'live-1', completed_on: '2026-09-16' }], error: null });
      }
      if (table === 'deleted_habit_history') {
        return chainable({
          data: [{ historical_date: '2026-09-17', stat: 'INT', completion_kind: 'easy' }],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchWeeklyReview('user-1', 'UTC', new Date('2026-09-17T12:00:00Z'));

    expect(weeklyStatTotal(result, 'STR')).toBe(1);
    expect(weeklyStatTotal(result, 'INT')).toBe(1);
  });

  it('returns seven ordered account-local date keys with zero-filled boundary days and exact counts', async () => {
    const counts = [
      ['2026-12-25', 'STR', 1], ['2026-12-26', 'INT', 3], ['2026-12-27', 'DEX', 4],
      ['2026-12-28', 'WIS', 10], ['2026-12-29', 'CHA', 1], ['2026-12-30', 'CHA', 2],
    ] as const;
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { habits: [], recurring_totals: {}, rows: counts.flatMap(([date, stat, count]) =>
      Array.from({ length: count }, (_, index) => ({ source_habit_id: `${stat}-${index}`, historical_date: date,
        habit_name: stat, stat, quest_type: 'habit', scheduled: true, completion_kind: 'full' }))) }, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') {
        return chainable({
          data: [
            { id: 'str', stat: 'STR' },
            { id: 'int', stat: 'INT' },
            { id: 'dex', stat: 'DEX' },
            { id: 'wis', stat: 'WIS' },
            { id: 'cha', stat: 'CHA' },
          ],
          error: null,
        });
      }
      if (table === 'habit_completions') {
        return chainable({
          data: [
            { habit_id: 'str', completed_on: '2026-12-25' },
            { habit_id: 'int', completed_on: '2026-12-26' },
            { habit_id: 'int', completed_on: '2026-12-26' },
            { habit_id: 'int', completed_on: '2026-12-26' },
            { habit_id: 'dex', completed_on: '2026-12-27' },
            { habit_id: 'dex', completed_on: '2026-12-27' },
            { habit_id: 'dex', completed_on: '2026-12-27' },
            { habit_id: 'dex', completed_on: '2026-12-27' },
            ...Array.from({ length: 10 }, () => ({ habit_id: 'wis', completed_on: '2026-12-28' })),
            { habit_id: 'cha', completed_on: '2026-12-29' },
            { habit_id: 'str', completed_on: '2027-01-01' },
          ],
          error: null,
        });
      }
      if (table === 'deleted_habit_history') {
        return chainable({
          data: [
            { source_habit_id: 'deleted-cha', historical_date: '2026-12-30', stat: 'CHA', completion_kind: 'easy' },
            { source_habit_id: 'deleted-cha-2', historical_date: '2026-12-30', stat: 'CHA', completion_kind: 'full' },
            { source_habit_id: 'deleted-empty', historical_date: '2026-12-31', stat: 'WIS', completion_kind: null },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchWeeklyReview(
      'user-1',
      'America/Los_Angeles',
      new Date('2027-01-01T00:30:00Z')
    );

    expect(result.map(day => day.dateKey)).toEqual([
      '2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28',
      '2026-12-29', '2026-12-30', '2026-12-31',
    ]);
    expect(result.map(day => day.day)).toEqual(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
    expect(result.map(day => [day.STR, day.INT, day.DEX, day.WIS, day.CHA])).toEqual([
      [1, 0, 0, 0, 0],
      [0, 3, 0, 0, 0],
      [0, 0, 4, 0, 0],
      [0, 0, 0, 10, 0],
      [0, 0, 0, 0, 1],
      [0, 0, 0, 0, 2],
      [0, 0, 0, 0, 0],
    ]);
  });

  it('adds retained recurring completions to weekly quest progress while keeping one-time rows out', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { habits: [], rows: [], recurring_totals: { DEX: 3 } }, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'weekly_quests') {
        return chainable({ data: { stat: 'DEX', target_count: 5 }, error: null });
      }
      if (table === 'habits') return chainable({ data: [{ id: 'live-1' }], error: null });
      if (table === 'habit_completions') return chainable({ count: 2, data: null, error: null });
      if (table === 'deleted_habit_history') {
        return chainable({
          data: [{ source_habit_id: 'deleted-recurring', stat: 'DEX', quest_type: 'habit' }],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const stats = {} as Record<Stat, StatData>;
    const result = await fetchOrCreateWeeklyQuest(
      'user-1',
      stats,
      'UTC',
      new Date('2026-09-17T12:00:00Z')
    );

    expect(result).toMatchObject({ weekStart: '2026-09-14', stat: 'DEX', currentCount: 3 });
  });

  it('keeps archived live definitions and deleted retained completions in AI summary inputs', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { habits: [{ id: 'archived-1', name: 'Archived', stat: 'WIS' }], recurring_totals: {}, rows: [
      { source_habit_id: 'archived-1', historical_date: '2026-09-15', habit_name: 'Archived', stat: 'WIS', quest_type: 'habit', scheduled: true, completion_kind: 'full' },
      { source_habit_id: 'deleted-1', historical_date: '2026-09-16', habit_name: 'Deleted', stat: 'CHA', quest_type: 'habit', scheduled: true, completion_kind: 'easy' },
    ] }, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') {
        return chainable({ data: [{ id: 'archived-1', name: 'Archived', stat: 'WIS' }], error: null });
      }
      if (table === 'habit_completions') {
        return chainable({ data: [{ habit_id: 'archived-1', kind: 'full' }], error: null });
      }
      if (table === 'deleted_habit_history') {
        return chainable({
          data: [
            {
              source_habit_id: 'deleted-1',
              habit_name: 'Deleted',
              stat: 'CHA',
              completion_kind: 'easy',
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await gatherWeekData('user-1', '2026-09-14', '2026-09-21');

    expect(result.habits).toEqual(
      expect.arrayContaining([
        { name: 'Archived', stat: 'WIS', fullCount: 1, easyCount: 0 },
        { name: 'Deleted', stat: 'CHA', fullCount: 0, easyCount: 1 },
      ])
    );
    expect(result.statTotals).toMatchObject({ WIS: 1, CHA: 1 });
  });
});
