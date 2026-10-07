import { fetchLongQuests, reorderLongQuests } from '../long-quests';
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
const missing = (column: string) => ({ code: '42703', message: `column long_quests.${column} does not exist` });

function serve(reads: Array<{ data?: unknown; error: unknown }>) {
  const builders = reads.map(chainable);
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

describe('fetchLongQuests manual order', () => {
  it('selects position and maps it', async () => {
    const [quests] = serve([{ data: [row({ strict_order: true, position: 3 }), row({ id: 'lq-2', strict_order: true, position: -1 })], error: null }]);
    const result = await fetchLongQuests('user-1');
    expect(quests.select).toHaveBeenCalledWith(expect.stringContaining('position'));
    expect(result.map(q => q.position)).toEqual([3, -1]);
  });

  it('retries without position alone when 044 is missing but 043 is applied', async () => {
    const [first, second] = serve([{ data: null, error: missing('position') }, { data: [row({ strict_order: false })], error: null }]);
    const result = await fetchLongQuests('user-1');
    expect(first.select).toHaveBeenCalledWith(expect.stringContaining('position'));
    expect(second.select).toHaveBeenCalledWith(expect.stringContaining('strict_order'));
    expect(second.select).toHaveBeenCalledWith(expect.not.stringContaining('position'));
    expect(result[0]).toMatchObject({ strictOrder: false, position: undefined });
  });

  it('drops both columns, one retry each, when neither migration is applied', async () => {
    const [first, second, third] = serve([
      { data: null, error: missing('strict_order') },
      { data: null, error: missing('position') },
      { data: [row()], error: null },
    ]);
    const result = await fetchLongQuests('user-1');
    expect(first.select).toHaveBeenCalledWith(expect.stringContaining('strict_order'));
    expect(second.select).toHaveBeenCalledWith(expect.not.stringContaining('strict_order'));
    expect(second.select).toHaveBeenCalledWith(expect.stringContaining('position'));
    expect(third.select).toHaveBeenCalledWith(expect.not.stringContaining('position'));
    expect(result).toHaveLength(1);
    expect(result[0].strictOrder).toBeUndefined();
    expect(result[0].position).toBeUndefined();
    expect((supabase.from as jest.Mock).mock.calls.filter(([t]) => t === 'long_quests')).toHaveLength(3);
  });

  it('recognises the missing position by its message when the code is absent', async () => {
    serve([{ data: null, error: { message: 'column long_quests.position does not exist' } }, { data: [row()], error: null }]);
    await expect(fetchLongQuests('user-1')).resolves.toHaveLength(1);
  });

  it('still throws any other error without retrying', async () => {
    const denied = { code: '42501', message: 'permission denied for table long_quests' };
    serve([{ data: null, error: denied }, { data: [row()], error: null }]);
    await expect(fetchLongQuests('user-1')).rejects.toBe(denied);
    expect((supabase.from as jest.Mock).mock.calls.filter(([t]) => t === 'long_quests')).toHaveLength(1);
  });

  it('does not swallow a missing column that is neither optional one', async () => {
    const other = missing('nickname');
    serve([{ data: null, error: other }, { data: [row()], error: null }]);
    await expect(fetchLongQuests('user-1')).rejects.toBe(other);
  });

  it('fails if the same column is reported missing again after it was dropped', async () => {
    const again = missing('position');
    serve([{ data: null, error: again }, { data: null, error: again }, { data: [row()], error: null }]);
    await expect(fetchLongQuests('user-1')).rejects.toBe(again);
  });
});

describe('reorderLongQuests', () => {
  it('sends the ids in order', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    await reorderLongQuests(['b', 'a']);
    expect(supabase.rpc).toHaveBeenCalledWith('reorder_long_quests', { p_ids: ['b', 'a'] });
  });

  it('surfaces the server error', async () => {
    const failure = new Error('Quest order is out of date. Reload and try again.');
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: failure });
    await expect(reorderLongQuests(['a'])).rejects.toBe(failure);
  });
});
