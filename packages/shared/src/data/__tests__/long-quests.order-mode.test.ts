import { fetchLongQuests, saveAtomicLongQuest } from '../long-quests';
import { supabase } from '../../supabase/client';

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn(() => builder),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'lq-1', name: 'Ship it', stat: 'INT', description: null, completed_at: null, created_at: '2026-10-01T00:00:00Z', ...extra,
});
const stageRows = [{ id: 's1', long_quest_id: 'lq-1', name: 'Plan', done: false, position: 0, description: null }];
const missingColumn = { code: '42703', message: 'column long_quests.strict_order does not exist' };

/** Queues one result per read of long_quests, then serves the stages table. */
function serve(questReads: Array<{ data?: unknown; error: unknown }>) {
  const builders = questReads.map(chainable);
  let next = 0;
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'long_quests') return builders[Math.min(next++, builders.length - 1)];
    if (table === 'long_quest_stages') return chainable({ data: stageRows, error: null });
    throw new Error(`unexpected table ${table}`);
  });
  return builders;
}

beforeEach(() => {
  (supabase.from as jest.Mock).mockReset();
  (supabase.rpc as jest.Mock).mockReset();
});

describe('fetchLongQuests order mode', () => {
  it('selects strict_order and maps it to strictOrder', async () => {
    const [quests] = serve([{ data: [row({ strict_order: false }), row({ id: 'lq-2', strict_order: true })], error: null }]);

    const result = await fetchLongQuests('user-1');

    expect(quests.select).toHaveBeenCalledWith(expect.stringContaining('strict_order'));
    expect(result.map(q => q.strictOrder)).toEqual([false, true]);
  });

  it('leaves strictOrder unset when the row carries no value, which the UI reads as in order', async () => {
    serve([{ data: [row()], error: null }]);

    const [quest] = await fetchLongQuests('user-1');

    expect(quest.strictOrder).toBeUndefined();
  });

  it('retries once without the column when it is not deployed yet, and every chain reads as in order', async () => {
    const [first, second] = serve([{ data: null, error: missingColumn }, { data: [row()], error: null }]);

    const result = await fetchLongQuests('user-1');

    expect(first.select).toHaveBeenCalledWith(expect.stringContaining('strict_order'));
    expect(second.select).toHaveBeenCalledWith(expect.not.stringContaining('strict_order'));
    expect(result).toHaveLength(1);
    expect(result[0].strictOrder).toBeUndefined();
    expect(result[0].stages).toHaveLength(1);
  });

  it('also recognises the missing column by its message when the code is absent', async () => {
    serve([{ data: null, error: { message: 'column long_quests.strict_order does not exist' } }, { data: [row()], error: null }]);

    await expect(fetchLongQuests('user-1')).resolves.toHaveLength(1);
  });

  it('still throws any other error without retrying', async () => {
    const denied = { code: '42501', message: 'permission denied for table long_quests' };
    serve([{ data: null, error: denied }, { data: [row()], error: null }]);

    await expect(fetchLongQuests('user-1')).rejects.toBe(denied);
    expect((supabase.from as jest.Mock).mock.calls.filter(([table]) => table === 'long_quests')).toHaveLength(1);
  });

  it('does not swallow a missing column that is not strict_order', async () => {
    const other = { code: '42703', message: 'column long_quests.nickname does not exist' };
    serve([{ data: null, error: other }, { data: [row()], error: null }]);

    await expect(fetchLongQuests('user-1')).rejects.toBe(other);
  });

  it('throws when the retry fails too', async () => {
    const down = { code: '08006', message: 'connection failure' };
    serve([{ data: null, error: missingColumn }, { data: null, error: down }]);

    await expect(fetchLongQuests('user-1')).rejects.toBe(down);
  });
});

describe('saveAtomicLongQuest order mode', () => {
  const input = { name: 'Ship it', stat: 'INT' as const, stages: [{ id: 's1', name: 'Plan', description: null }] };

  it('sends strictOrder in the saved definition when the caller chose a mode', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'lq-1', error: null });

    await saveAtomicLongQuest('lq-1', 'req-1', { ...input, strictOrder: false }, false);

    expect(supabase.rpc).toHaveBeenCalledWith('save_long_quest_definition', expect.objectContaining({
      p_input: expect.objectContaining({ strictOrder: false }),
    }));
  });

  it('omits the key when no mode was chosen, so the server keeps the current one', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'lq-1', error: null });

    await saveAtomicLongQuest('lq-1', 'req-2', input, false);

    const payload = (supabase.rpc as jest.Mock).mock.calls[0][1].p_input;
    expect(payload).not.toHaveProperty('strictOrder');
  });
});
