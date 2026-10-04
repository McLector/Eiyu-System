import { createHabit, updateHabit, fetchTodayOneTimeHabits, fetchUpcomingOneTimeHabits, fetchTodayHabits, fetchAllActiveHabits, fetchBacklogQuests, moveBacklogToOneTime, moveOneTimeToBacklog } from '../habits';
import { supabase } from '../../supabase/client';

function chainable(result: { data?: unknown; error: unknown }) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

jest.mock('../../supabase/client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

/** The board reads today's habits in ordered, ranged pages; wrap an RPC mock so that one call chains like PostgREST. */
function pageable(impl: (name: string, args: unknown) => Promise<unknown>) {
  return (name: string, args: unknown) => {
    const result = impl(name, args);
    if (name !== 'get_habits_for_date') return result;
    const builder: any = { order: () => builder, range: () => result };
    return builder;
  };
}

function mockTimeZoneInitialization() {
  (supabase.rpc as jest.Mock).mockReset().mockImplementation(async (name: string) => {
    if (name === 'initialize_account_time_zone') return { data: 'UTC', error: null };
    throw new Error(`unexpected RPC ${name}`);
  });
}

describe('createHabit / updateHabit — scheduled_date column mapping', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    mockTimeZoneInitialization();
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
    const updated = jest.fn(() => chainable({ data: { id: 'h1' }, error: null }));
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

  it('rejects an update when the authenticated write affects no definition', async () => {
    const noRows = chainable({ data: null, error: null });
    const updated = jest.fn(() => noRows);
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { update: updated };
      throw new Error(`unexpected table ${table}`);
    });

    await expect(updateHabit('deleted-habit', {
      name: 'Morning walk', easyVersion: 'One minute', stat: 'STR', difficulty: 'Medium',
      time: '08:00', days: [1, 2, 3],
    })).rejects.toThrow(/no longer exists|could not be updated/i);
    expect(noRows.maybeSingle).toHaveBeenCalledTimes(1);
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

  it('rejects an 81-code-point create before timezone initialization or database access', async () => {
    (supabase.from as jest.Mock).mockReturnValue({ insert: jest.fn() });
    await expect(createHabit('user-1', {
      name: '😀'.repeat(81), stat: 'INT', difficulty: 'Medium', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6],
    })).rejects.toThrow(/80 characters/);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('accepts an 80-code-point create and validates edits before any write', async () => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h-boundary' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { insert: inserted };
      throw new Error(`unexpected table ${table}`);
    });
    const input = { name: '😀'.repeat(80), stat: 'INT' as const, difficulty: 'Medium' as const, time: '09:00', days: [0, 1, 2, 3, 4, 5, 6] };
    await expect(createHabit('user-1', input)).resolves.toBe('h-boundary');
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ name: input.name }));

    (supabase.from as jest.Mock).mockClear();
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { update: jest.fn(() => chainable({ data: { id: 'h-boundary' }, error: null })) };
      throw new Error(`unexpected table ${table}`);
    });
    (supabase.rpc as jest.Mock).mockClear();
    await expect(updateHabit('h-boundary', { ...input, name: '😀'.repeat(81) })).rejects.toThrow(/80 characters/);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('allows an unchanged over-limit legacy name only when its persisted value is supplied', async () => {
    const updated = jest.fn(() => chainable({ data: { id: 'legacy' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return { update: updated };
      throw new Error(`unexpected table ${table}`);
    });
    const legacyName = '🧭'.repeat(81);
    await expect((updateHabit as (...args: any[]) => Promise<void>)('legacy', {
      name: legacyName, stat: 'STR', difficulty: 'Easy', time: '08:00', days: [1, 3, 5],
    }, legacyName)).resolves.toBeUndefined();
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ name: legacyName }));
  });
});

describe('fetchTodayHabits — quantity-habit progress join', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    mockTimeZoneInitialization();
  });

  it('joins progressCount from habit_progress, defaulting to 0 when no row exists', async () => {
    const habitRows = [
      {
        id: 'h1', user_id: 'user-1', name: 'Water', easy_version: null, description: null,
        quest_type: 'habit', stat: 'STR', difficulty: 'Easy', reminder_time: '09:00:00',
        days: [0, 1, 2, 3, 4, 5, 6], archived: false,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
        scheduled_date: null, target_count: 8, schedule_start_on: '2026-09-01',
      },
      {
        id: 'h2', user_id: 'user-1', name: 'Read', easy_version: 'Read 1 page', description: null,
        quest_type: 'habit', stat: 'WIS', difficulty: 'Easy', reminder_time: '20:00:00',
        days: [0, 1, 2, 3, 4, 5, 6], archived: false,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
        scheduled_date: null, target_count: null, schedule_start_on: '2026-09-01',
      },
    ];
    (supabase.rpc as jest.Mock).mockImplementation(pageable(async (name: string) => {
      if (name === 'initialize_account_time_zone') return { data: 'UTC', error: null };
      if (name === 'get_habits_for_date') return { data: habitRows, error: null };
      if (name === 'get_open_habit_recoveries') return { data: [], error: null };
      throw new Error(`unexpected RPC ${name}`);
    }));
    const completionsBuilder: any = {
      select: jest.fn(() => completionsBuilder),
      eq: jest.fn(() => completionsBuilder),
      in: jest.fn(() => completionsBuilder),
      order: jest.fn(() => completionsBuilder),
      range: jest.fn(() => Promise.resolve({ data: [], error: null })),
      gte: jest.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const progressBuilder: any = {
      select: jest.fn(() => progressBuilder),
      eq: jest.fn(() => progressBuilder),
      in: jest.fn(() => progressBuilder),
      order: jest.fn(() => progressBuilder),
      range: jest.fn(() => Promise.resolve({ data: [{ habit_id: 'h1', progress_count: 3 }], error: null })),
    };
    const occurrencesBuilder: any = {
      select: jest.fn(() => occurrencesBuilder),
      eq: jest.fn(() => occurrencesBuilder),
      in: jest.fn(() => occurrencesBuilder),
      lte: jest.fn(() => occurrencesBuilder),
      order: jest.fn(() => occurrencesBuilder),
      range: jest.fn(() =>
        Promise.resolve({
          data: [
            { habit_id: 'h1', occurrence_date: '2026-09-01' },
            { habit_id: 'h2', occurrence_date: '2026-09-01' },
          ],
          error: null,
        })
      ),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: habitRows, error: null });
      if (table === 'habit_completions') return completionsBuilder;
      if (table === 'habit_occurrences') return occurrencesBuilder;
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests the account-local date returned by persisted timezone initialization', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T00:30:00.000Z'));
    (supabase.rpc as jest.Mock).mockImplementation(pageable(async (name: string, args: unknown) => {
      if (name === 'initialize_account_time_zone') {
        return { data: 'America/Los_Angeles', error: null };
      }
      if (name === 'get_habits_for_date') {
        expect(args).toEqual({ p_date: '2026-09-10' });
        return { data: [], error: null };
      }
      if (name === 'get_open_habit_recoveries') return { data: [], error: null };
      throw new Error(`unexpected RPC ${name}`);
    }));
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return chainable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    await expect(fetchTodayHabits('user-1')).resolves.toEqual([]);
  });

  it('returns an off-day open recovery without placing it in the daily set', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T08:00:00.000Z'));
    const recoveryHabit = {
      id: 'h-recovery', user_id: 'user-1', name: 'Read', easy_version: 'Read 1 page',
      description: null, quest_type: 'habit', stat: 'WIS', difficulty: 'Easy',
      reminder_time: '20:00:00', days: [1, 3, 5], archived: false,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      scheduled_date: null, target_count: null, schedule_start_on: '2026-09-01',
    };
    (supabase.rpc as jest.Mock).mockImplementation(pageable(async (name: string) => {
      if (name === 'initialize_account_time_zone') return { data: 'Asia/Manila', error: null };
      if (name === 'get_habits_for_date') return { data: [], error: null };
      if (name === 'get_open_habit_recoveries') {
        return {
          data: [{
            habit_id: 'h-recovery', missed_on: '2026-09-10', preserved_streak: 7,
            opened_at: '2026-09-11T00:00:00Z', deadline_at: '2026-09-12T00:00:00Z',
            time_zone: 'Asia/Manila',
          }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    }));

    const habitsBuilder: any = {
      select: jest.fn(() => habitsBuilder),
      eq: jest.fn(() => habitsBuilder),
      in: jest.fn(() => Promise.resolve({ data: [recoveryHabit], error: null })),
      order: jest.fn(() => habitsBuilder),
      range: jest.fn(() => habitsBuilder),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: [recoveryHabit], error: null }).then(resolve),
    };
    const emptyBuilder: any = {
      select: jest.fn(() => emptyBuilder),
      eq: jest.fn(() => emptyBuilder),
      in: jest.fn(() => emptyBuilder),
      lte: jest.fn(() => emptyBuilder),
      order: jest.fn(() => emptyBuilder),
      range: jest.fn(() => Promise.resolve({ data: [], error: null })),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return habitsBuilder;
      if (table === 'habit_completions') return emptyBuilder;
      if (table === 'habit_occurrences') return emptyBuilder;
      if (table === 'habit_progress') return emptyBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    await expect(fetchTodayHabits('user-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'h-recovery', dailyEligible: false, frozen: true, frozenDate: '2026-09-10',
        streak: 7, recoveryDeadline: '2026-09-12T00:00:00Z',
        recoveryTimeZone: 'Asia/Manila',
      }),
    ]);
  });

  it('returns the full habit catalog plus today one-time items with separate eligibility', async () => {
    const recurring = {
      id: 'h-off-day', user_id: 'user-1', name: 'MWF habit', easy_version: 'One minute',
      description: null, quest_type: 'habit', stat: 'STR', difficulty: 'Medium',
      reminder_time: '08:00:00', days: [1, 3, 5], archived: false,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      scheduled_date: null, target_count: null, schedule_start_on: '2026-09-01',
    };
    const archived = { ...recurring, id: 'h-archived', name: 'Archived habit', archived: true };
    const oneTime = {
      ...recurring, id: 'one-today', name: 'One-time today', easy_version: null,
      quest_type: 'one_time', days: [], scheduled_date: '2026-09-11',
    };
    const archivedOneTime = {
      ...oneTime, id: 'one-archived', name: 'Archived one-time', archived: true,
      scheduled_date: '2026-09-08',
    };
    const futureOneTime = {
      ...oneTime, id: 'one-future', name: 'Future one-time', scheduled_date: '2026-09-12',
    };
    (supabase.rpc as jest.Mock).mockImplementation(pageable(async (name: string) => {
      if (name === 'initialize_account_time_zone') return { data: 'UTC', error: null };
      if (name === 'get_habits_for_date') return { data: [oneTime], error: null };
      if (name === 'get_open_habit_recoveries') return { data: [], error: null };
      throw new Error(`unexpected RPC ${name}`);
    }));
    // The authenticated table read includes all owned definitions. The board
    // must retain archived rows, exclude active one-time quests off today, and
    // deduplicate today's active one-time row returned by both transports.
    const catalogBuilder = chainable({ data: [recurring, archived, archivedOneTime, futureOneTime, oneTime], error: null });
    const emptyBuilder: any = {
      select: jest.fn(() => emptyBuilder),
      eq: jest.fn(() => emptyBuilder),
      in: jest.fn(() => emptyBuilder),
      lte: jest.fn(() => emptyBuilder),
      order: jest.fn(() => emptyBuilder),
      range: jest.fn(() => Promise.resolve({ data: [], error: null })),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'habits') return catalogBuilder;
      if (table === 'habit_completions') return emptyBuilder;
      if (table === 'habit_occurrences') return emptyBuilder;
      if (table === 'habit_progress') return emptyBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const quests = await fetchTodayHabits('user-1');
    expect(quests.map(quest => quest.id)).toEqual(expect.arrayContaining([
      'h-off-day', 'h-archived', 'one-archived', 'one-today',
    ]));
    expect(quests).toHaveLength(4);
    expect(quests.filter(quest => quest.id === 'one-today')).toHaveLength(1);
    expect(quests.some(quest => quest.id === 'one-future')).toBe(false);
    expect(quests.find(quest => quest.id === 'h-off-day')).toMatchObject({ dailyEligible: false, archived: false });
    expect(quests.find(quest => quest.id === 'h-archived')).toMatchObject({ dailyEligible: false, archived: true });
    expect(quests.find(quest => quest.id === 'one-today')).toMatchObject({ questType: 'one_time' });
    expect(quests.find(quest => quest.id === 'one-archived')).toMatchObject({
      questType: 'one_time', archived: true, dailyEligible: false,
    });
  });
});

describe('fetchTodayOneTimeHabits', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    mockTimeZoneInitialization();
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

describe('fetchUpcomingOneTimeHabits', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    mockTimeZoneInitialization();
  });

  it('reads only active one-time definitions from today forward with their original dates', async () => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      gte: jest.fn(() => builder),
      then: (resolve: (v: { data: unknown; error: null }) => void) => Promise.resolve({
        data: [{ id: 'future', name: 'Future task', reminder_time: '09:30:00', scheduled_date: '2026-10-03' }],
        error: null,
      }).then(resolve),
    };
    (supabase.from as jest.Mock).mockReturnValue(builder);

    const reminders = await fetchUpcomingOneTimeHabits('user-1');

    expect(builder.select).toHaveBeenCalledWith('id, name, reminder_time, scheduled_date');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.eq).toHaveBeenCalledWith('archived', false);
    expect(builder.eq).toHaveBeenCalledWith('quest_type', 'one_time');
    expect(builder.gte).toHaveBeenCalledWith('scheduled_date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(reminders).toEqual([{ id: 'future', name: 'Future task', time: '09:30', date: '2026-10-03' }]);
  });
});

describe('Backlog, genre and optional time', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    mockTimeZoneInitialization();
  });

  const captured = (table = 'habits') => {
    const inserted = jest.fn(() => chainable({ data: { id: 'h1' }, error: null }));
    (supabase.from as jest.Mock).mockImplementation((name: string) => {
      if (name === table) return { insert: inserted, update: inserted };
      throw new Error(`unexpected table ${name}`);
    });
    return inserted;
  };

  it('writes a Backlog quest with no days, date, penalty or target', async () => {
    const inserted = captured();
    await createHabit('user-1', {
      name: 'Try Obsidian', stat: 'INT', difficulty: 'Easy', time: '07:00', days: [1, 2, 3],
      questType: 'backlog', easyVersion: 'ignored', scheduledDate: '2026-10-10', targetCount: 5, genre: 'tool', timeSet: true,
    });
    const row = (inserted.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).toMatchObject({
      quest_type: 'backlog', days: [], scheduled_date: null, easy_version: null, target_count: null,
      genre: 'tool', time_set: false, reminder_time: '07:00',
    });
  });

  it('keeps a One-time quest genre and optional time', async () => {
    const inserted = captured();
    await createHabit('user-1', {
      name: 'Read RFC', stat: 'WIS', difficulty: 'Medium', time: '08:00', days: [],
      questType: 'one_time', scheduledDate: '2026-10-10', genre: 'article', timeSet: false,
    });
    expect((inserted.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({
      quest_type: 'one_time', genre: 'article', time_set: false, scheduled_date: '2026-10-10',
    });
  });

  it('never gives a habit a genre and always marks its time as set', async () => {
    const inserted = captured();
    await createHabit('user-1', {
      name: 'Run', stat: 'STR', difficulty: 'Easy', time: '07:00', days: [1], easyVersion: 'Walk', genre: 'tool', timeSet: false,
    });
    expect((inserted.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ genre: null, time_set: true });
  });

  it('does not send genre or time_set when a caller omits them, so an edit cannot reset them', async () => {
    const updated = captured();
    await updateHabit('h1', {
      name: 'Read RFC', stat: 'WIS', difficulty: 'Medium', time: '08:00', days: [], questType: 'one_time', scheduledDate: '2026-10-10',
    });
    const row = (updated.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).not.toHaveProperty('genre');
    expect(row).not.toHaveProperty('time_set');
  });

  it('lists only recurring habits for reminders', async () => {
    const builder = chainable({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue(builder);
    await fetchAllActiveHabits('user-1');
    expect(builder.eq).toHaveBeenCalledWith('quest_type', 'habit');
    expect(builder.neq).toBeUndefined();
  });

  it('reads Backlog quests newest first and maps genre and time', async () => {
    const row = (id: string, created: string) => ({
      id, user_id: 'user-1', name: id, easy_version: null, description: 'note', quest_type: 'backlog', stat: 'INT', difficulty: 'Easy',
      reminder_time: '08:00:00', days: [], archived: false, created_at: created, updated_at: created,
      scheduled_date: null, target_count: null, schedule_start_on: '2026-10-01', genre: 'concept', time_set: false,
    });
    const builder = chainable({ data: [row('old', '2026-10-01T00:00:00Z'), row('new', '2026-10-03T00:00:00Z')], error: null });
    builder.range = jest.fn(() => Promise.resolve({ data: [row('old', '2026-10-01T00:00:00Z'), row('new', '2026-10-03T00:00:00Z')], error: null }));
    (supabase.from as jest.Mock).mockReturnValue(builder);
    const quests = await fetchBacklogQuests('user-1');
    expect(builder.eq).toHaveBeenCalledWith('quest_type', 'backlog');
    expect(builder.eq).toHaveBeenCalledWith('archived', false);
    expect(quests.map(q => q.id)).toEqual(['new', 'old']);
    expect(quests[0]).toMatchObject({ questType: 'backlog', genre: 'concept', timeSet: false, days: [], completed: false, easyVersion: null });
  });

  it('calls the server functions for the two moves and surfaces their errors', async () => {
    (supabase.rpc as jest.Mock).mockReset().mockResolvedValue({ data: null, error: null });
    await moveBacklogToOneTime('h1');
    await moveOneTimeToBacklog('h2');
    expect(supabase.rpc).toHaveBeenCalledWith('move_backlog_to_one_time', { p_id: 'h1' });
    expect(supabase.rpc).toHaveBeenCalledWith('move_one_time_to_backlog', { p_id: 'h2' });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('quest has a completion') });
    await expect(moveOneTimeToBacklog('h2')).rejects.toThrow('quest has a completion');
  });
});
