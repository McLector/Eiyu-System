import { archiveHabit, deleteHabit, reorderQuests, restoreHabit } from '../habits';
import { fetchHistoryRange } from '../history';
import { supabase } from '../../supabase/client';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));

const OWNER = 'da230000-0000-4000-8000-000000000001';
const REVISION = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const HABIT = { kind: 'habit' as const, id: 'da230000-0000-4000-8000-0000000000a1', inputKind: 'custom' as const };

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
    (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 't' } }, error: null });
    (supabase.rpc as jest.Mock).mockReset().mockImplementation(() => trackerRpcDouble({ data: null, error: null }));
  });

  it('routes archive, restore, and permanent delete through the gateway with the captured snapshot', async () => {
    await archiveHabit(HABIT.id, REVISION, [HABIT]);
    await restoreHabit(HABIT.id, REVISION, [HABIT]);
    await deleteHabit(HABIT.id, REVISION, [HABIT]);

    for (const [index, operation] of ['archive_habit', 'restore_habit', 'delete_habit'].entries()) {
      expect(supabase.rpc).toHaveBeenNthCalledWith(index + 1, 'apply_tracker_write', {
        p_operation: operation, p_arguments: { p_habit_id: HABIT.id, p_expected_targets: [HABIT] }, p_expected: REVISION,
      });
    }
  });

  it('never calls the retired direct lifecycle RPCs and surfaces a stale-revision refusal', async () => {
    const stale = Object.assign(new Error('Tracker access changed.'), { code: 'ET003' });
    (supabase.rpc as jest.Mock).mockImplementation(() => trackerRpcDouble({ data: null, error: stale }));
    await expect(archiveHabit(HABIT.id, REVISION, [HABIT])).rejects.toBe(stale);
    await expect(deleteHabit(HABIT.id, REVISION, [HABIT])).rejects.toBe(stale);
    expect((supabase.rpc as jest.Mock).mock.calls.every(call => call[0] === 'apply_tracker_write')).toBe(true);
  });
});

describe('delete is no longer idempotent on the server', () => {
  const OWNER2 = OWNER;
  const gone = () => Object.assign(new Error('Tracker target unavailable.'), { code: '42501' });
  const lost = () => Object.assign(new Error('network'), {});
  beforeEach(() => {
    (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER2 }, access_token: 't' } }, error: null });
  });
  const answer = (...errors: unknown[]) => {
    const queue = [...errors];
    (supabase.rpc as jest.Mock).mockReset().mockImplementation(() => trackerRpcDouble({ data: null, error: queue.shift() ?? null }));
  };

  it('throws 42501 for a habit this session never tried to delete', async () => {
    const id = 'da230000-0000-4000-8000-0000000000b1';
    const failure = gone();
    answer(failure);
    await expect(deleteHabit(id, REVISION, [{ ...HABIT, id }])).rejects.toBe(failure);
  });

  it('settles a retry that gets 42501 after its own earlier uncertain attempt, and only once', async () => {
    const id = 'da230000-0000-4000-8000-0000000000b2';
    answer(lost(), gone(), gone());
    await expect(deleteHabit(id, REVISION, [{ ...HABIT, id }])).rejects.toThrow('network');
    await expect(deleteHabit(id, REVISION, [{ ...HABIT, id }])).resolves.toBeUndefined();
    const again = await deleteHabit(id, REVISION, [{ ...HABIT, id }]).catch((e: unknown) => e);
    expect((again as { code?: string }).code).toBe('42501');
  });

  it('does not settle after a confirmed refusal of the earlier attempt', async () => {
    const id = 'da230000-0000-4000-8000-0000000000b3';
    const stale = Object.assign(new Error('stale'), { code: 'ET003' });
    answer(stale, gone());
    await expect(deleteHabit(id, REVISION, [{ ...HABIT, id }])).rejects.toBe(stale);
    await expect(deleteHabit(id, REVISION, [{ ...HABIT, id }])).rejects.toMatchObject({ code: '42501' });
  });

  it('does not settle for another habit', async () => {
    const a = 'da230000-0000-4000-8000-0000000000b4', b = 'da230000-0000-4000-8000-0000000000b5';
    answer(lost(), gone());
    await expect(deleteHabit(a, REVISION, [{ ...HABIT, id: a }])).rejects.toThrow();
    await expect(deleteHabit(b, REVISION, [{ ...HABIT, id: b }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('reorder refusals are surfaced untouched and never retried', () => {
  it.each(['ET003', '42501'])('reorderQuests surfaces %s once', async code => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 't' } }, error: null });
    const failure = Object.assign(new Error('refused'), { code });
    (supabase.rpc as jest.Mock).mockReset().mockImplementation(() => trackerRpcDouble({ data: null, error: failure }));
    await expect(reorderQuests('habit', [HABIT.id], REVISION, [HABIT])).rejects.toBe(failure);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
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
