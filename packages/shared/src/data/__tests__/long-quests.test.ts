import { deleteLongQuest, fetchLongQuests, reorderLongQuests, saveAtomicLongQuest, setStageDoneWithReceipt, type LongQuestInput } from '../long-quests';
import { supabase } from '../../supabase/client';
import { UncertainSaveError } from '../save-outcome';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';
import type { ChainEditorInput } from '../../logic/tracker-input';

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));

describe('fetchLongQuests', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('maps quest and stage descriptions through to the returned LongQuest objects', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') {
        return chainable({
          data: [{ id: 'lq-1', name: 'Ship a Side Project', stat: 'INT', description: 'build momentum', completed_at: null }],
          error: null,
        });
      }
      if (table === 'long_quest_stages') {
        return chainable({
          data: [
            { id: 's1', long_quest_id: 'lq-1', name: 'Plan', done: false, position: 0, description: 'scope it out' },
            { id: 's2', long_quest_id: 'lq-1', name: 'Build', done: false, position: 1, description: null },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const quests = await fetchLongQuests('user-1');

    expect(quests).toEqual([
      {
        id: 'lq-1',
        name: 'Ship a Side Project',
        stat: 'INT',
        description: 'build momentum',
        completedAt: null,
        stages: [
          { id: 's1', name: 'Plan', done: false, description: 'scope it out' },
          { id: 's2', name: 'Build', done: false, description: null },
        ],
      },
    ]);
  });
});

describe('fetchLongQuests created date', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('selects created_at and returns it as createdAt, without changing the order the rows arrive in', async () => {
    const quests = chainable({
      data: [
        { id: 'lq-1', name: 'First', stat: 'INT', description: null, completed_at: null, created_at: '2026-09-12T08:30:00Z' },
        { id: 'lq-2', name: 'Second', stat: 'STR', description: null, completed_at: '2026-10-01T10:00:00Z', created_at: '2026-09-20T08:30:00Z' },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') return quests;
      if (table === 'long_quest_stages') return chainable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchLongQuests('user-1');

    expect(quests.select).toHaveBeenCalledWith(expect.stringContaining('created_at'));
    expect(result.map(q => [q.id, q.createdAt])).toEqual([['lq-1', '2026-09-12T08:30:00Z'], ['lq-2', '2026-09-20T08:30:00Z']]);
  });

  it('leaves createdAt undefined for a row that did not carry it, instead of inventing a date', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') return chainable({ data: [{ id: 'lq-1', name: 'Old', stat: 'INT', description: null, completed_at: null }], error: null });
      return chainable({ data: [], error: null });
    });
    const [quest] = await fetchLongQuests('user-1');
    expect(quest.createdAt).toBeUndefined();
  });
});

const OWNER = 'da230000-0000-4000-8000-000000000001';
const REVISION = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const CHAIN_ID = 'da230000-0000-4000-8000-0000000000d1';
const REQUEST_ID = 'da230000-0000-4000-8000-0000000000e1';
const STAGE_ID = 'da230000-0000-4000-8000-0000000000f1';
const CHAIN = { kind: 'chain' as const, id: CHAIN_ID, inputKind: 'custom' as const };
const rpc = supabase.rpc as jest.Mock;

function gateway(data: unknown = null, error: unknown = null) {
  rpc.mockReset().mockImplementation((name: string) => {
    if (name === 'apply_tracker_write') return trackerRpcDouble({ data, error });
    if (name === 'get_long_quest_definition_receipt' || name === 'get_long_quest_reward_receipt') return Promise.resolve({ data: null, error: null });
    throw new Error(`unexpected RPC ${name}`);
  });
}
const gatewayCalls = () => rpc.mock.calls.filter(call => call[0] === 'apply_tracker_write').map(call => call[1]);

beforeEach(() => {
  (supabase.from as jest.Mock).mockReset();
  (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 't' } }, error: null });
});

describe('saveAtomicLongQuest through the gateway', () => {
  const custom = (extra: Partial<LongQuestInput> = {}): ChainEditorInput => ({
    mode: 'custom',
    values: { name: 'Ship a Side Project', stat: 'INT', description: '  build momentum  ', stages: [
      { name: 'Plan', description: '  scope it out  ' }, { id: STAGE_ID, name: 'Build', description: null }, { name: 'Ship' },
    ], ...extra },
  });

  it('creates with no snapshots, trimmed text and the request id', async () => {
    gateway(CHAIN_ID);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom(), true, REVISION, [])).resolves.toBe(CHAIN_ID);
    expect(gatewayCalls()).toEqual([{
      p_operation: 'chain-save',
      p_arguments: {
        p_id: CHAIN_ID, p_request_id: REQUEST_ID, p_create: true, p_mode: 'custom', p_expected_targets: [],
        p_input: {
          stat: 'INT', name: 'Ship a Side Project', description: 'build momentum',
          stages: [{ name: 'Plan', description: 'scope it out' }, { id: STAGE_ID, name: 'Build', description: null }, { name: 'Ship', description: null }],
        },
      },
      p_expected: REVISION,
    }]);
  });

  it('edits with the captured chain snapshot and sends strictOrder only when chosen', async () => {
    gateway(CHAIN_ID);
    await saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ strictOrder: false }), false, REVISION, [CHAIN]);
    await saveAtomicLongQuest(CHAIN_ID, 'da230000-0000-4000-8000-0000000000e2', custom(), false, REVISION, [CHAIN]);
    const [first, second] = gatewayCalls();
    expect(first.p_arguments.p_create).toBe(false);
    expect(first.p_arguments.p_expected_targets).toEqual([CHAIN]);
    expect(first.p_arguments.p_input.strictOrder).toBe(false);
    expect(second.p_arguments.p_input).not.toHaveProperty('strictOrder');
  });

  it('sends a basic chain with ids only and no text', async () => {
    gateway(CHAIN_ID);
    await saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, { mode: 'basic', values: { stat: 'WIS', stages: [{ id: STAGE_ID }, {}] } }, true, REVISION, []);
    expect(gatewayCalls()[0].p_arguments).toMatchObject({ p_mode: 'basic', p_input: { stat: 'WIS', stages: [{ id: STAGE_ID }, {}] } });
    expect(JSON.stringify(gatewayCalls()[0].p_arguments.p_input)).not.toMatch(/name|description/);
  });

  it('rejects an over-limit stage description, an 81-code-point name and a blank stage before any request', async () => {
    gateway(CHAIN_ID);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ stages: [{ name: 'S1', description: 'a'.repeat(2001) }] }), true, REVISION, []))
      .rejects.toThrow('Stage descriptions must be 2000 characters or fewer.');
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ name: '😀'.repeat(81) }), true, REVISION, [])).rejects.toThrow(/80 characters/);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ stages: [{ name: '   ' }] }), true, REVISION, [])).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows an unchanged over-limit legacy name only when its persisted value is supplied', async () => {
    gateway(CHAIN_ID);
    const legacy = '🧭'.repeat(81);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ name: legacy }), false, REVISION, [CHAIN], legacy)).resolves.toBe(CHAIN_ID);
    expect(gatewayCalls()[0].p_arguments.p_input.name).toBe(legacy);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom({ name: legacy }), false, REVISION, [CHAIN])).rejects.toThrow(/80 characters/);
  });

  it('surfaces a confirmed gateway refusal without a reconciliation loop or a direct write', async () => {
    const refusal = Object.assign(new Error('Tracker access changed.'), { code: 'ET003' });
    gateway(null, refusal);
    await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom(), false, REVISION, [CHAIN])).rejects.toBe(refusal);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not report an uncertain save when the request was refused locally', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'someone-else' }, access_token: 't' } }, error: null });
    rpc.mockReset();
    const failure = await saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom(), true, REVISION, []).catch((e: unknown) => e);
    expect(failure).not.toBeInstanceOf(UncertainSaveError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not accept a result that is not the saved chain', async () => {
    for (const odd of [null, 4, { id: CHAIN_ID }, 'da230000-0000-4000-8000-0000000000ff']) {
      gateway(odd);
      await expect(saveAtomicLongQuest(CHAIN_ID, REQUEST_ID, custom(), true, REVISION, [])).rejects.toThrow();
    }
  });
});

describe('the other chain operations through the gateway', () => {
  it('reorders with a snapshot for every id and surfaces the error', async () => {
    const other = { kind: 'chain' as const, id: 'da230000-0000-4000-8000-0000000000d2', inputKind: 'basic' as const };
    gateway();
    await reorderLongQuests([other.id, CHAIN_ID], REVISION, [other, CHAIN]);
    expect(gatewayCalls()).toEqual([{
      p_operation: 'reorder_long_quests', p_arguments: { p_ids: [other.id, CHAIN_ID], p_expected_targets: [other, CHAIN] }, p_expected: REVISION,
    }]);
    const failure = Object.assign(new Error('Quest order is out of date. Reload and try again.'), { code: 'P0001' });
    gateway(null, failure);
    await expect(reorderLongQuests([CHAIN_ID], REVISION, [CHAIN])).rejects.toBe(failure);
  });

  it('deletes through chain-delete with the captured snapshot', async () => {
    gateway();
    await deleteLongQuest(CHAIN_ID, REVISION, [CHAIN]);
    expect(gatewayCalls()).toEqual([{ p_operation: 'chain-delete', p_arguments: { p_id: CHAIN_ID, p_expected_targets: [CHAIN] }, p_expected: REVISION }]);
    expect(supabase.from).not.toHaveBeenCalled();
    const stale = Object.assign(new Error('stale'), { code: 'ET003' });
    gateway(null, stale);
    await expect(deleteLongQuest(CHAIN_ID, REVISION, [CHAIN])).rejects.toBe(stale);
  });

  const receipt = { id: REQUEST_ID, stage_id: STAGE_ID, done: true, changed: true, replayed: false, components: [], totals: [] };

  it('completes a stage with the parent chain snapshot and returns the receipt', async () => {
    gateway(receipt);
    await expect(setStageDoneWithReceipt(STAGE_ID, true, REQUEST_ID, REVISION, [CHAIN])).resolves.toEqual(receipt);
    expect(gatewayCalls()).toEqual([{
      p_operation: 'set_long_quest_stage_done_receipt',
      p_arguments: { p_stage_id: STAGE_ID, p_done: true, p_request_id: REQUEST_ID, p_expected_targets: [CHAIN] },
      p_expected: REVISION,
    }]);
  });

  it('surfaces an authoritative sequence rejection without looking for a receipt', async () => {
    const rejection = Object.assign(new Error('Complete earlier stages first'), { code: 'P0001' });
    gateway(null, rejection);
    await expect(setStageDoneWithReceipt(STAGE_ID, true, REQUEST_ID, REVISION, [CHAIN])).rejects.toBe(rejection);
    expect(rpc.mock.calls.map(c => c[0]).filter(name => name === 'apply_tracker_write')).toHaveLength(1);
  });

  it('rejects a result that is not a receipt', async () => {
    for (const odd of [null, 'ok', 7]) {
      gateway(odd);
      await expect(setStageDoneWithReceipt(STAGE_ID, true, REQUEST_ID, REVISION, [CHAIN])).rejects.toThrow();
    }
  });
});

describe('fetchLongQuests classification', () => {
  const rows = (ids: string[]) => ids.map(id => ({ id, name: id, stat: 'INT', description: null, completed_at: null, created_at: '2026-10-01T00:00:00Z' }));
  const serve = (ids: string[]) => (supabase.from as jest.Mock).mockReset().mockImplementation((table: string) =>
    chainable({ data: table === 'long_quests' ? rows(ids) : [], error: null }));

  it('reads inputKind and canWrite from the chain classification', async () => {
    serve([CHAIN_ID]);
    rpc.mockReset().mockImplementation((name: string, args: { p_kind: string; p_ids: string[] }) => {
      if (name !== 'get_tracker_targets') throw new Error(`unexpected RPC ${name}`);
      expect(args.p_kind).toBe('chain');
      return trackerRpcDouble({ data: [{ kind: 'chain', id: CHAIN_ID, inputKind: 'basic', canWrite: true }], error: null });
    });
    const [quest] = await fetchLongQuests(OWNER);
    expect(quest).toMatchObject({ inputKind: 'basic', canWrite: true });
  });

  it('leaves chains unclassified, never basic, when the classification is missing or unreadable', async () => {
    serve([CHAIN_ID]);
    for (const data of [null, [], [{ kind: 'chain', id: CHAIN_ID, canWrite: true }]]) {
      rpc.mockReset().mockImplementation(() => trackerRpcDouble({ data, error: null }));
      const [quest] = await fetchLongQuests(OWNER);
      expect(quest.inputKind).toBeUndefined();
      expect(quest.canWrite).toBeUndefined();
    }
  });
});
