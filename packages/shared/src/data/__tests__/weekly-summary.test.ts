import { regenerateWeeklySummary } from '../weekly-summary';
import { supabase } from '../../supabase/client';
import { generateWeeklySummary } from '../../ai/suggestions';

jest.mock('../../ai/suggestions', () => ({
  generateWeeklySummary: jest.fn(async () => 'a fresh paragraph'),
}));

jest.mock('../../supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

/** Minimal chainable Postgrest-builder stand-in: every filter method returns
 * itself, and the object resolves (via `then`) to the given result — same
 * shape a real supabase-js query builder resolves to when awaited. */
function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lt: jest.fn(() => builder),
    update: jest.fn(() => builder),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe('regenerateWeeklySummary', () => {
  // Thursday — mondayOfWeek(now) must resolve to 2026-08-31.
  const now = new Date('2026-09-03T12:00:00Z');

  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
    (supabase.from as jest.Mock).mockReset();
    (generateWeeklySummary as jest.Mock).mockClear();
  });

  it('reserves a regen slot, gathers week data, generates and saves a new summary', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 1, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') {
        return chainable({ data: [{ id: 'h1', name: 'Read', stat: 'INT' }], error: null });
      }
      if (table === 'habit_completions') {
        return chainable({ data: [{ habit_id: 'h1', kind: 'full' }], error: null });
      }
      if (table === 'weekly_summaries') {
        return chainable({ error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await regenerateWeeklySummary('user-1', now);

    expect(result).toBe('a fresh paragraph');
    expect(supabase.rpc).toHaveBeenCalledWith('reserve_weekly_summary_regen', {
      p_week_start: '2026-08-31',
    });
    expect(generateWeeklySummary).toHaveBeenCalledTimes(1);
    expect((supabase.from as jest.Mock).mock.calls.some(([t]) => t === 'weekly_summaries')).toBe(true);
  });

  it('throws and never calls generateWeeklySummary when the reservation is rejected', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      // Real supabase-js rejects with a PostgrestError, which extends Error.
      // Jest's `.rejects.toThrow(string)` only recognizes rejections that
      // pass `isError()` (see @jest/expect-utils) - a plain
      // `{ message, code }` object does not, and the assertion below would
      // report "did not throw" even though regenerateWeeklySummary rethrows
      // it correctly. Object.assign onto a real Error keeps both the
      // message-based matcher and the .code property realistic.
      error: Object.assign(new Error('regen cap reached for week 2026-08-31'), { code: 'P0001' }),
    });

    await expect(regenerateWeeklySummary('user-1', now)).rejects.toThrow('regen cap reached');
    await expect(regenerateWeeklySummary('user-1', now)).rejects.toMatchObject({ code: 'P0001' });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(generateWeeklySummary).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws if the final update fails after a successful generation', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 1, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: [], error: null });
      if (table === 'habit_completions') return chainable({ data: [], error: null });
      if (table === 'weekly_summaries') return chainable({ error: new Error('update failed') });
      throw new Error(`unexpected table ${table}`);
    });

    await expect(regenerateWeeklySummary('user-1', now)).rejects.toThrow('update failed');
  });
});
