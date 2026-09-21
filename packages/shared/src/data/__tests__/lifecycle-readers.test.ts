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

  it('adds retained recurring completions to weekly quest progress while keeping one-time rows out', async () => {
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
