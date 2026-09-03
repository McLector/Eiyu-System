import { createLongQuest, fetchLongQuests } from '../long-quests';
import { supabase } from '../../supabase/client';

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn() },
}));

describe('createLongQuest', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('inserts the quest with a trimmed description, then stage rows with trimmed descriptions and 0-based positions', async () => {
    const insertedQuest = jest.fn(() => chainable({ data: { id: 'lq-1' }, error: null }));
    const insertedStages = jest.fn(() => chainable({ error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') return { insert: insertedQuest };
      if (table === 'long_quest_stages') return { insert: insertedStages };
      throw new Error(`unexpected table ${table}`);
    });

    const id = await createLongQuest('user-1', {
      name: 'Ship a Side Project',
      stat: 'INT',
      description: '  build momentum  ',
      stages: [
        { name: 'Plan', description: '  scope it out  ' },
        { name: 'Build', description: null },
        { name: 'Ship' }, // description omitted entirely
      ],
    });

    expect(id).toBe('lq-1');
    expect(insertedQuest).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', name: 'Ship a Side Project', description: 'build momentum' })
    );
    expect(insertedStages).toHaveBeenCalledWith([
      { long_quest_id: 'lq-1', user_id: 'user-1', name: 'Plan', description: 'scope it out', position: 0 },
      { long_quest_id: 'lq-1', user_id: 'user-1', name: 'Build', description: null, position: 1 },
      { long_quest_id: 'lq-1', user_id: 'user-1', name: 'Ship', description: null, position: 2 },
    ]);
  });

  it('stores a null description when omitted or blank', async () => {
    const insertedQuest = jest.fn(() => chainable({ data: { id: 'lq-2' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') return { insert: insertedQuest };
      if (table === 'long_quest_stages') return { insert: jest.fn(() => chainable({ error: null })) };
      throw new Error(`unexpected table ${table}`);
    });

    await createLongQuest('user-1', { name: 'Q', stat: 'STR', description: '   ', stages: [{ name: 'S1' }] });

    expect(insertedQuest).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });
});

describe('fetchLongQuests', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('maps quest and stage descriptions through to the returned LongQuest objects', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'long_quests') {
        return chainable({
          data: [{ id: 'lq-1', name: 'Ship a Side Project', stat: 'INT', description: 'build momentum' }],
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
        stages: [
          { id: 's1', name: 'Plan', done: false, description: 'scope it out' },
          { id: 's2', name: 'Build', done: false, description: null },
        ],
      },
    ]);
  });
});
