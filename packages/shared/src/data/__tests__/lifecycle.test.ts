import { archiveHabit, deleteHabit, restoreHabit } from '../habits';
import { fetchHistoryRange } from '../history';
import { supabase } from '../../supabase/client';

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lt: jest.fn(() => builder),
    then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe('habit lifecycle transport', () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('routes archive, restore, and permanent delete through their explicit RPCs', async () => {
    await archiveHabit('habit-1');
    await restoreHabit('habit-1');
    await deleteHabit('habit-1');

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'archive_habit', { p_habit_id: 'habit-1' });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'restore_habit', { p_habit_id: 'habit-1' });
    expect(supabase.rpc).toHaveBeenNthCalledWith(3, 'delete_habit', { p_habit_id: 'habit-1' });
  });
});

describe('fetchHistoryRange — deleted habit ledger', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    (supabase.rpc as jest.Mock).mockReset().mockImplementation(async (name: string) => {
      if (name === 'initialize_account_time_zone' || name === 'ensure_habit_occurrences') {
        return { data: name === 'initialize_account_time_zone' ? 'UTC' : null, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
  });

  it('includes deleted scheduled and completion evidence without requiring a live habit row', async () => {
    const deletedRow = {
      source_habit_id: 'deleted-1',
      historical_date: '2026-09-10',
      habit_name: 'Deleted habit',
      stat: 'STR',
      quest_type: 'habit',
      scheduled: true,
      completion_kind: 'full',
      xp_awarded: 20,
      time_zone: 'UTC',
      day_ends_at: '2026-09-11T00:00:00.000Z',
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: [], error: null });
      if (table === 'habit_occurrences') return chainable({ data: [], error: null });
      if (table === 'habit_completions') return chainable({ data: [], error: null });
      if (table === 'deleted_habit_history') return chainable({ data: [deletedRow], error: null });
      throw new Error(`unexpected table ${table}`);
    });
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => {
      if (name === 'initialize_account_time_zone' || name === 'ensure_habit_occurrences') {
        return { data: name === 'initialize_account_time_zone' ? 'UTC' : null, error: null };
      }
      if (name === 'read_history_range') {
        return { data: { rows: [deletedRow], habits: [], recurring_totals: { STR: 1 } }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });

    const result = await fetchHistoryRange(
      'user-1',
      new Date('2026-09-10T00:00:00.000Z'),
      new Date('2026-09-11T00:00:00.000Z')
    );

    expect(result['2026-09-10']).toEqual({
      completions: [{ habitName: 'Deleted habit', kind: 'full' }],
      completedCount: 1,
      scheduledCount: 1,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
