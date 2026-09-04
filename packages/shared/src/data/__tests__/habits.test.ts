import { createHabit, updateHabit, fetchTodayOneTimeHabits } from '../habits';
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
