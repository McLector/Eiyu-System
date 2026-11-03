import { regenerateWeeklySummary } from '../weekly-summary';
import { supabase } from '../../supabase/client';
import { generateWeeklySummary } from '../../ai/suggestions';

jest.mock('../../ai/suggestions', () => ({
  generateWeeklySummary: jest.fn(async () => 'a fresh paragraph'),
}));
jest.mock('../account-age', () => ({ requireAdultDeclaration: jest.fn(async () => ({ userId: 'user-1', version: 1 })) }));
jest.mock('../processing-access', () => ({requireDebriefAccess: jest.fn(async () => ({
  contractVersion: 1, userId: 'user-1', ageVersion: 1, consentVersion: 2, authorityVersion: 0,
  mailboxVersion: 1, ageEligible: true, ageConsent: true, aiConsent: true,
  canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required',
}))}));
jest.mock('../mailbox', () => ({ requireMailboxProof: jest.fn(async () => ({ userId: 'user-1', version: 1, verified: true })) }));

jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {getSession: jest.fn(async () => ({data:{session:{user:{id:'user-1'},access_token:'inert-user-1'}},error:null}))},
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
    setHeader: jest.fn(() => builder),
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

  it('reserves a regen slot, generates from the metadata-only command and saves a new summary', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => name === 'read_history_range'
      ? chainable({ data: { habits: [{ id: 'h1', name: 'Read', stat: 'INT' }], recurring_totals: { INT: 1 }, rows: [
        { source_habit_id: 'h1', historical_date: '2026-09-03', habit_name: 'Read', stat: 'INT', quest_type: 'habit', scheduled: true, completion_kind: 'full' },
      ] }, error: null })
      : chainable({ data: 1, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') {
        return chainable({ data: [{ id: 'h1', name: 'Read', stat: 'INT' }], error: null });
      }
      if (table === 'habit_completions') {
        return chainable({ data: [{ habit_id: 'h1', kind: 'full' }], error: null });
      }
      if (table === 'deleted_habit_history') {
        return chainable({ data: [], error: null });
      }
      if (table === 'weekly_summaries') {
        return chainable({ error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await regenerateWeeklySummary('user-1', 'UTC', now);

    expect(result).toBe('a fresh paragraph');
    expect(supabase.rpc).toHaveBeenCalledWith('reserve_weekly_summary_regen', {
      p_week_start: '2026-08-31',
    });
    expect(generateWeeklySummary).toHaveBeenCalledTimes(1);
    expect(generateWeeklySummary).toHaveBeenCalledWith('2026-08-31', expect.anything());
    expect((supabase.rpc as jest.Mock).mock.calls.map(c => c[0])).not.toContain('read_history_range');
    expect((supabase.from as jest.Mock).mock.calls.some(([t]) => t === 'weekly_summaries')).toBe(true);
  });

  it('throws and never calls generateWeeklySummary when the reservation is rejected', async () => {
    (supabase.rpc as jest.Mock).mockReturnValue(chainable({
      data: null,
      // Real supabase-js rejects with a PostgrestError, which extends Error.
      // Jest's `.rejects.toThrow(string)` only recognizes rejections that
      // pass `isError()` (see @jest/expect-utils) - a plain
      // `{ message, code }` object does not, and the assertion below would
      // report "did not throw" even though regenerateWeeklySummary rethrows
      // it correctly. Object.assign onto a real Error keeps both the
      // message-based matcher and the .code property realistic.
      error: Object.assign(new Error('regen cap reached for week 2026-08-31'), { code: 'P0001' }),
    }));

    await expect(regenerateWeeklySummary('user-1', 'UTC', now)).rejects.toThrow('regen cap reached');
    await expect(regenerateWeeklySummary('user-1', 'UTC', now)).rejects.toMatchObject({ code: 'P0001' });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(generateWeeklySummary).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws if the final update fails after a successful generation', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => name === 'read_history_range'
      ? chainable({ data: { habits: [], recurring_totals: {}, rows: [] }, error: null })
      : chainable({ data: 1, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: [], error: null });
      if (table === 'habit_completions') return chainable({ data: [], error: null });
      if (table === 'deleted_habit_history') return chainable({ data: [], error: null });
      if (table === 'weekly_summaries') return chainable({ error: new Error('update failed') });
      throw new Error(`unexpected table ${table}`);
    });

    await expect(regenerateWeeklySummary('user-1', 'UTC', now)).rejects.toThrow('update failed');
  });
});
