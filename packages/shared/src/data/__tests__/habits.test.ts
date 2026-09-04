import { createHabit, updateHabit, fetchTodayOneTimeHabits, fetchTodayHabits } from '../habits';
import { supabase } from '../../supabase/client';

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn() },
}));

describe('createHabit / updateHabit — scheduled_date column mapping', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('writes scheduledDate to the scheduled_date column for a one-time quest', async () => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h1' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { insert: inserted };
      throw new Error(`unexpected table ${table}`);
    });

    await createHabit('user-1', {
      name: 'One-off task', stat: 'INT', difficulty: 'Medium', time: '09:00', days: [],
      questType: 'one_time', scheduledDate: '2026-09-10',
    });

    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled_date: '2026-09-10', quest_type: 'one_time' })
    );
  });

  it('writes null scheduled_date when omitted', async () => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h2' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { insert: inserted };
      throw new Error(`unexpected table ${table}`);
    });

    await createHabit('user-1', {
      name: 'Recurring', stat: 'STR', difficulty: 'Easy', time: '07:00', days: [1, 2, 3],
    });

    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: null }));
  });

  it('updateHabit writes scheduled_date the same way as createHabit', async () => {
    const updated = jest.fn(() => chainable({ error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { update: updated };
      throw new Error(`unexpected table ${table}`);
    });

    await updateHabit('h1', {
      name: 'One-off task', stat: 'INT', difficulty: 'Medium', time: '09:00', days: [],
      questType: 'one_time', scheduledDate: '2026-09-11',
    });

    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: '2026-09-11' }));
  });

  it('writes target_count for a quantity habit, forced null for one-time', async () => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h3' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { insert: inserted };
      throw new Error(`unexpected table ${table}`);
    });

    await createHabit('user-1', {
      name: 'Drink water', stat: 'STR', difficulty: 'Easy', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6],
      questType: 'habit', targetCount: 8,
    });

    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ target_count: 8 }));
  });

  it('forces target_count null for a one-time quest even if supplied', async () => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h4' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { insert: inserted };
      throw new Error(`unexpected table ${table}`);
    });

    await createHabit('user-1', {
      name: 'One-off', stat: 'INT', difficulty: 'Medium', time: '09:00', days: [],
      questType: 'one_time', targetCount: 5,
    });

    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ target_count: null }));
  });
});

describe('fetchTodayHabits — quantity-habit progress join', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('joins progressCount from habit_progress, defaulting to 0 when no row exists', async () => {
    const habitsBuilder: any = {
      select: jest.fn(() => habitsBuilder),
      eq: jest.fn(() => habitsBuilder),
      or: jest.fn(() => habitsBuilder),
      order: jest.fn(() =>
        Promise.resolve({
          data: [
            {
              id: 'h1', user_id: 'user-1', name: 'Water', easy_version: null, description: null,
              quest_type: 'habit', stat: 'STR', difficulty: 'Easy', reminder_time: '09:00:00',
              days: [0, 1, 2, 3, 4, 5, 6], archived: false,
              created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
              scheduled_date: null, target_count: 8,
            },
            {
              id: 'h2', user_id: 'user-1', name: 'Read', easy_version: 'Read 1 page', description: null,
              quest_type: 'habit', stat: 'WIS', difficulty: 'Easy', reminder_time: '20:00:00',
              days: [0, 1, 2, 3, 4, 5, 6], archived: false,
              created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
              scheduled_date: null, target_count: null,
            },
          ],
          error: null,
        })
      ),
    };
    const completionsBuilder: any = {
      select: jest.fn(() => completionsBuilder),
      eq: jest.fn(() => completionsBuilder),
      in: jest.fn(() => completionsBuilder),
      gte: jest.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const progressBuilder: any = {
      select: jest.fn(() => progressBuilder),
      eq: jest.fn(() => progressBuilder),
      in: jest.fn(() => Promise.resolve({ data: [{ habit_id: 'h1', progress_count: 3 }], error: null })),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return habitsBuilder;
      if (table === 'habit_completions') return completionsBuilder;
      if (table === 'habit_progress') return progressBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const quests = await fetchTodayHabits('user-1');

    const water = quests.find(q => q.id === 'h1')!;
    const read = quests.find(q => q.id === 'h2')!;
    expect(water.targetCount).toBe(8);
    expect(water.progressCount).toBe(3);
    expect(read.targetCount).toBeNull();
    expect(read.progressCount).toBe(0);
  });
});

describe('fetchTodayOneTimeHabits', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('filters by scheduled_date equality to today, not a created_at range', async () => {
    const eqCalls: [string, unknown][] = [];
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return builder;
      }),
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return builder;
      throw new Error(`unexpected table ${table}`);
    });

    await fetchTodayOneTimeHabits('user-1');

    const scheduledDateCall = eqCalls.find(([col]) => col === 'scheduled_date');
    expect(scheduledDateCall).toBeDefined();
    expect(builder.eq).not.toHaveBeenCalledWith('created_at', expect.anything());
  });
});
