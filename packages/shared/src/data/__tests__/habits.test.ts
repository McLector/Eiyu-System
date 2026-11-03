import { createHabit, updateHabit, fetchTodayOneTimeHabits, fetchUpcomingOneTimeHabits, fetchTodayHabits, fetchAllActiveHabits, fetchBacklogQuests, moveBacklogToOneTime, moveOneTimeToBacklog, reorderQuests, type HabitInput } from '../habits';
import { supabase } from '../../supabase/client';
import { trackerRpcDouble } from '../../test-support/tracker-rpc';
import type { HabitEditorInput } from '../../logic/tracker-input';

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
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getSession: jest.fn() } },
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

// Reminder reads also ask for the tracker classification; answer it as unavailable so rows stay unclassified.
function mockTimeZoneWithoutClassification() {
  (supabase.rpc as jest.Mock).mockReset().mockImplementation((name: string) => {
    if (name === 'initialize_account_time_zone') return Promise.resolve({ data: 'UTC', error: null });
    if (name === 'get_tracker_targets') return trackerRpcDouble({ data: null, error: Object.assign(new Error('unavailable'), { code: '42501' }) });
    throw new Error(`unexpected RPC ${name}`);
  });
}

const OWNER = 'da230000-0000-4000-8000-000000000001';
const REVISION = { userId: OWNER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const HABIT_ID = 'da230000-0000-4000-8000-0000000000a1';
const CREATION_ID = 'da230000-0000-4000-8000-0000000000c1';
const BASIC_TARGET = { kind: 'habit' as const, id: HABIT_ID, inputKind: 'basic' as const };

/** Answers the gateway (and the zone call) and records what the gateway received. */
function mockGateway(result: unknown = null, error: unknown = null) {
  (supabase.rpc as jest.Mock).mockReset().mockImplementation((name: string) => {
    if (name === 'apply_tracker_write') return trackerRpcDouble({ data: result, error });
    if (name === 'initialize_account_time_zone') return Promise.resolve({ data: 'UTC', error: null });
    throw new Error(`unexpected RPC ${name}`);
  });
}
const gatewayCall = () => (supabase.rpc as jest.Mock).mock.calls.find(call => call[0] === 'apply_tracker_write')![1];
const customInput = (extra: Partial<HabitInput> = {}): HabitEditorInput => ({
  mode: 'custom',
  values: { name: 'Morning walk', easyVersion: 'One minute', stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1, 2, 3], ...extra },
});

describe('createHabit / updateHabit — the revision-bound gateway', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 'token-a' } }, error: null });
    mockGateway(CREATION_ID);
  });

  it('creates through habit-save with the caller creation id, no snapshots and a pinned session', async () => {
    await expect(createHabit('user-1', customInput(), REVISION, CREATION_ID)).resolves.toBe(CREATION_ID);
    expect(gatewayCall()).toEqual({
      p_operation: 'habit-save',
      p_arguments: {
        p_id: CREATION_ID, p_create: true, p_mode: 'custom', p_expected_targets: [],
        p_input: { stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1, 2, 3], name: 'Morning walk', easyVersion: 'One minute' },
      },
      p_expected: REVISION,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sends the same creation id on every retry', async () => {
    await createHabit('user-1', customInput(), REVISION, CREATION_ID);
    await createHabit('user-1', customInput(), REVISION, CREATION_ID);
    const ids = (supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'apply_tracker_write').map(c => c[1].p_arguments.p_id);
    expect(ids).toEqual([CREATION_ID, CREATION_ID]);
  });

  it('passes a one-time date and a quantity target to the server, which derives the stored time', async () => {
    await createHabit('user-1', customInput({ questType: 'one_time', scheduledDate: '2026-09-10', timeSet: true }), REVISION, CREATION_ID);
    expect(gatewayCall().p_arguments.p_input).toMatchObject({ questType: 'one_time', scheduledDate: '2026-09-10', timeSet: true });
    await createHabit('user-1', customInput({ questType: 'habit', targetCount: 8 }), REVISION, CREATION_ID);
    expect((supabase.rpc as jest.Mock).mock.calls.filter(c => c[0] === 'apply_tracker_write')[1][1].p_arguments.p_input.targetCount).toBe(8);
  });

  it('sends a basic habit with no text at all', async () => {
    const editor: HabitEditorInput = { mode: 'basic', values: { stat: 'INT', difficulty: 'Easy', time: '09:00', days: [0, 6] } };
    await createHabit('user-1', editor, REVISION, CREATION_ID);
    const call = gatewayCall();
    expect(call.p_arguments.p_mode).toBe('basic');
    expect(call.p_arguments.p_input).toEqual({ stat: 'INT', difficulty: 'Easy', time: '09:00', days: [0, 6] });
  });

  it('does not accept a result that is not the created id', async () => {
    for (const odd of [null, 7, { id: CREATION_ID }, 'da230000-0000-4000-8000-0000000000ff']) {
      mockGateway(odd);
      await expect(createHabit('user-1', customInput(), REVISION, CREATION_ID)).rejects.toThrow();
    }
  });

  it('refuses a missing creation id before any request', async () => {
    await expect(createHabit('user-1', customInput(), REVISION, '')).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects an 81-code-point create before any request', async () => {
    await expect(createHabit('user-1', customInput({ name: '😀'.repeat(81) }), REVISION, CREATION_ID)).rejects.toThrow(/80 characters/);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('accepts an 80-code-point create and validates edits before any request', async () => {
    const name = '😀'.repeat(80);
    await expect(createHabit('user-1', customInput({ name }), REVISION, CREATION_ID)).resolves.toBe(CREATION_ID);
    expect(gatewayCall().p_arguments.p_input.name).toBe(name);
    (supabase.rpc as jest.Mock).mockClear();
    await expect(updateHabit(HABIT_ID, customInput({ name: '😀'.repeat(81) }), REVISION, [BASIC_TARGET])).rejects.toThrow(/80 characters/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('updates through habit-save with the captured snapshot, p_create false and a pinned revision', async () => {
    mockGateway(HABIT_ID);
    await expect(updateHabit(HABIT_ID, customInput({ scheduledDate: null }), REVISION, [{ ...BASIC_TARGET, inputKind: 'custom' }])).resolves.toBeUndefined();
    expect(gatewayCall()).toEqual({
      p_operation: 'habit-save',
      p_arguments: {
        p_id: HABIT_ID, p_create: false, p_mode: 'custom', p_expected_targets: [{ ...BASIC_TARGET, inputKind: 'custom' }],
        p_input: { stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1, 2, 3], name: 'Morning walk', easyVersion: 'One minute', scheduledDate: null },
      },
      p_expected: REVISION,
    });
  });

  it('keeps a basic root basic and makes basic-to-custom an explicit custom save', async () => {
    mockGateway(HABIT_ID);
    await updateHabit(HABIT_ID, { mode: 'basic', values: { stat: 'STR', difficulty: 'Easy', time: '07:00', days: [1] } }, REVISION, [BASIC_TARGET]);
    expect(gatewayCall().p_arguments.p_mode).toBe('basic');
    expect(gatewayCall().p_arguments.p_input).not.toHaveProperty('name');
    mockGateway(HABIT_ID);
    await updateHabit(HABIT_ID, customInput(), REVISION, [BASIC_TARGET]);
    expect(gatewayCall().p_arguments).toMatchObject({ p_mode: 'custom', p_expected_targets: [BASIC_TARGET] });
  });

  it('allows an unchanged over-limit legacy name only when its persisted value is supplied', async () => {
    mockGateway(HABIT_ID);
    const legacyName = '🧭'.repeat(81);
    await expect(updateHabit(HABIT_ID, customInput({ name: legacyName }), REVISION, [BASIC_TARGET], legacyName)).resolves.toBeUndefined();
    expect(gatewayCall().p_arguments.p_input.name).toBe(legacyName);
    await expect(updateHabit(HABIT_ID, customInput({ name: legacyName }), REVISION, [BASIC_TARGET])).rejects.toThrow(/80 characters/);
  });

  it('surfaces a gateway refusal unchanged and never writes the table directly', async () => {
    const refusal = Object.assign(new Error('Tracker access changed.'), { code: 'ET003' });
    mockGateway(null, refusal);
    await expect(updateHabit(HABIT_ID, customInput(), REVISION, [BASIC_TARGET])).rejects.toBe(refusal);
    await expect(createHabit('user-1', customInput(), REVISION, CREATION_ID)).rejects.toBe(refusal);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('refuses to write for a different session owner without a request', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'someone-else' }, access_token: 't' } }, error: null });
    await expect(createHabit('user-1', customInput(), REVISION, CREATION_ID)).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
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
    mockTimeZoneWithoutClassification();
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
    (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 'token-a' } }, error: null });
    mockTimeZoneInitialization();
  });

  it('sends Backlog, genre and untimed fields to the server, which owns the stored shape', async () => {
    mockGateway(CREATION_ID);
    await createHabit('user-1', customInput({ questType: 'backlog', genre: 'tool', timeSet: true, scheduledDate: null, targetCount: null }), REVISION, CREATION_ID);
    expect(gatewayCall().p_arguments.p_input).toMatchObject({ questType: 'backlog', genre: 'tool', timeSet: true, scheduledDate: null, targetCount: null });
  });

  it('does not send genre or timeSet when a caller omits them, so an edit cannot reset them', async () => {
    mockGateway(HABIT_ID);
    await updateHabit(HABIT_ID, customInput({ questType: 'one_time', scheduledDate: '2026-10-10' }), REVISION, [BASIC_TARGET]);
    expect(gatewayCall().p_arguments.p_input).not.toHaveProperty('genre');
    expect(gatewayCall().p_arguments.p_input).not.toHaveProperty('timeSet');
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

  it('orders Backlog by the stored position when every row has one', async () => {
    const row = (id: string, created: string, position?: number) => ({
      id, user_id: 'user-1', name: id, easy_version: null, description: null, quest_type: 'backlog', stat: 'INT', difficulty: 'Easy',
      reminder_time: '08:00:00', days: [], archived: false, created_at: created, updated_at: created,
      scheduled_date: null, target_count: null, schedule_start_on: '2026-10-01', genre: null, time_set: false,
      ...(position === undefined ? {} : { position }),
    });
    const serve = (rows: unknown[]) => {
      const builder = chainable({ data: rows, error: null });
      builder.range = jest.fn(() => Promise.resolve({ data: rows, error: null }));
      (supabase.from as jest.Mock).mockReturnValue(builder);
    };
    serve([row('newest', '2026-10-03T00:00:00Z', 2), row('oldest', '2026-10-01T00:00:00Z', 0), row('mid', '2026-10-02T00:00:00Z', 1)]);
    const ordered = await fetchBacklogQuests('user-1');
    expect(ordered.map(q => q.id)).toEqual(['oldest', 'mid', 'newest']);
    expect(ordered.map(q => q.position)).toEqual([0, 1, 2]);

    // One row without a position (a database from before 044): keep newest first.
    serve([row('old', '2026-10-01T00:00:00Z', 0), row('new', '2026-10-03T00:00:00Z')]);
    const fallback = await fetchBacklogQuests('user-1');
    expect(fallback.map(q => q.id)).toEqual(['new', 'old']);
    expect(fallback.map(q => q.position)).toEqual([undefined, 0]);
  });

  it('sends the visible ids in order through the gateway with a snapshot for every id, and surfaces its error', async () => {
    const other = { kind: 'habit' as const, id: 'da230000-0000-4000-8000-0000000000a2', inputKind: 'custom' as const };
    mockGateway();
    await reorderQuests('backlog', [other.id, HABIT_ID], REVISION, [other, BASIC_TARGET]);
    expect(gatewayCall()).toEqual({
      p_operation: 'reorder_quests',
      p_arguments: { p_quest_type: 'backlog', p_ids: [other.id, HABIT_ID], p_expected_targets: [other, BASIC_TARGET] },
      p_expected: REVISION,
    });
    const failure = Object.assign(new Error('Quest order is out of date. Reload and try again.'), { code: 'P0001' });
    mockGateway(null, failure);
    await expect(reorderQuests('habit', [HABIT_ID], REVISION, [BASIC_TARGET])).rejects.toBe(failure);
  });

  it('maps the stored scheduled_date onto the quest so an edit can keep it', async () => {
    const created = '2026-10-03T00:00:00Z';
    const row = (scheduled: string | null) => ({
      id: 'q', user_id: 'user-1', name: 'q', easy_version: null, description: null, quest_type: 'one_time', stat: 'INT', difficulty: 'Easy',
      reminder_time: '08:00:00', days: [], archived: false, created_at: created, updated_at: created,
      scheduled_date: scheduled, target_count: null, schedule_start_on: '2026-10-01', genre: null, time_set: true,
    });
    for (const scheduled of ['2026-10-10', null]) {
      const builder = chainable({ data: [row(scheduled)], error: null });
      builder.range = jest.fn(() => Promise.resolve({ data: [row(scheduled)], error: null }));
      (supabase.from as jest.Mock).mockReturnValue(builder);
      const quests = await fetchBacklogQuests('user-1');
      expect(quests[0].scheduledDate).toBe(scheduled);
    }
  });

  it('moves through the gateway with the captured snapshot and surfaces its errors', async () => {
    mockGateway();
    await moveBacklogToOneTime(HABIT_ID, REVISION, [BASIC_TARGET]);
    await moveOneTimeToBacklog(HABIT_ID, REVISION, [BASIC_TARGET]);
    const calls = (supabase.rpc as jest.Mock).mock.calls.map(c => c[1]);
    expect(calls[0]).toEqual({ p_operation: 'move_backlog_to_one_time', p_arguments: { p_id: HABIT_ID, p_expected_targets: [BASIC_TARGET] }, p_expected: REVISION });
    expect(calls[1]).toEqual({ p_operation: 'move_one_time_to_backlog', p_arguments: { p_id: HABIT_ID, p_expected_targets: [BASIC_TARGET] }, p_expected: REVISION });
    mockGateway(null, new Error('quest has a completion'));
    await expect(moveOneTimeToBacklog(HABIT_ID, REVISION, [BASIC_TARGET])).rejects.toThrow('quest has a completion');
  });
});

describe('quest view models carry the tracker classification', () => {
  const row = (id: string) => ({
    id, user_id: OWNER, name: id, easy_version: null, description: null, quest_type: 'backlog', stat: 'INT', difficulty: 'Easy',
    reminder_time: '08:00:00', days: [], archived: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    scheduled_date: null, target_count: null, schedule_start_on: '2026-10-01', genre: null, time_set: false,
  });
  const serve = (rows: unknown[]) => {
    const builder = chainable({ data: rows, error: null });
    builder.range = jest.fn(() => Promise.resolve({ data: rows, error: null }));
    (supabase.from as jest.Mock).mockReset().mockReturnValue(builder);
  };
  beforeEach(() => {
    (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue({ data: { session: { user: { id: OWNER }, access_token: 'token-a' } }, error: null });
  });

  it('reads inputKind and canWrite for the listed quests', async () => {
    serve([row('da230000-0000-4000-8000-0000000000b1'), row('da230000-0000-4000-8000-0000000000b2')]);
    (supabase.rpc as jest.Mock).mockReset().mockImplementation((name: string, args: { p_ids: string[] }) => {
      if (name !== 'get_tracker_targets') throw new Error(`unexpected RPC ${name}`);
      return trackerRpcDouble({ data: args.p_ids.map((id, i) => ({ kind: 'habit', id, inputKind: i ? 'custom' : 'basic', canWrite: !i })), error: null });
    });
    const quests = await fetchBacklogQuests(OWNER);
    expect(quests.map(q => [q.inputKind, q.canWrite])).toEqual(expect.arrayContaining([['basic', true], ['custom', false]]));
  });

  it('leaves quests unclassified, never basic, when the classification cannot be read or is incomplete', async () => {
    serve([row('da230000-0000-4000-8000-0000000000b1')]);
    for (const data of [null, [], [{ kind: 'habit', id: 'da230000-0000-4000-8000-0000000000b1', canWrite: true }]]) {
      (supabase.rpc as jest.Mock).mockReset().mockImplementation(() => trackerRpcDouble({ data, error: null }));
      const [quest] = await fetchBacklogQuests(OWNER);
      expect(quest).toBeDefined();
      expect(quest.inputKind).toBeUndefined();
      expect(quest.canWrite).toBeUndefined();
    }
    (supabase.rpc as jest.Mock).mockReset().mockImplementation(() => trackerRpcDouble({ data: null, error: Object.assign(new Error('x'), { code: '42501' }) }));
    expect((await fetchBacklogQuests(OWNER))[0].inputKind).toBeUndefined();
  });

  const classifyAs = (kinds: Record<string, 'basic' | 'custom'>) => {
    (supabase.rpc as jest.Mock).mockReset().mockImplementation((name: string, args: { p_ids: string[] }) => {
      if (name === 'initialize_account_time_zone') return Promise.resolve({ data: 'UTC', error: null });
      if (name !== 'get_tracker_targets') throw new Error(`unexpected RPC ${name}`);
      return trackerRpcDouble({ data: args.p_ids.filter(id => kinds[id]).map(id => ({ kind: 'habit', id, inputKind: kinds[id], canWrite: kinds[id] === 'basic' })), error: null });
    });
  };
  const B1 = 'da230000-0000-4000-8000-0000000000c1';
  const C1 = 'da230000-0000-4000-8000-0000000000c2';
  const U1 = 'da230000-0000-4000-8000-0000000000c3';

  it('classifies recurring reminder rows so a denied custom purpose never drops basic reminders', async () => {
    const builder = chainable({ data: [B1, C1, U1].map(id => ({ id, name: id, reminder_time: '08:00:00', days: [1] })), error: null });
    (supabase.from as jest.Mock).mockReset().mockReturnValue(builder);
    classifyAs({ [B1]: 'basic', [C1]: 'custom', [U1]: 'custom' });
    const rows = await fetchAllActiveHabits(OWNER);
    expect(rows.map(r => [r.id, r.inputKind])).toEqual([[B1, 'basic'], [C1, 'custom'], [U1, 'custom']]);
    // One missing classification refuses the whole read: every row stays unclassified, never basic.
    classifyAs({ [B1]: 'basic', [C1]: 'custom' });
    expect((await fetchAllActiveHabits(OWNER)).map(r => r.inputKind)).toEqual([undefined, undefined, undefined]);
  });

  it('classifies upcoming one-time reminder rows and leaves an unreadable classification unclassified', async () => {
    const data = [B1, C1].map(id => ({ id, name: id, reminder_time: '09:30:00', scheduled_date: '2026-10-30' }));
    const builder: any = {
      select: jest.fn(() => builder), eq: jest.fn(() => builder), gte: jest.fn(() => builder), order: jest.fn(() => builder),
      then: (resolve: (v: { data: unknown; error: null }) => void) => Promise.resolve({ data, error: null }).then(resolve),
    };
    (supabase.from as jest.Mock).mockReset().mockReturnValue(builder);
    classifyAs({ [B1]: 'basic', [C1]: 'custom' });
    expect((await fetchUpcomingOneTimeHabits(OWNER)).map(r => r.inputKind)).toEqual(['basic', 'custom']);
    mockTimeZoneWithoutClassification();
    expect((await fetchUpcomingOneTimeHabits(OWNER)).map(r => r.inputKind)).toEqual([undefined, undefined]);
  });

  it('makes no classification request for an empty list', async () => {
    serve([]);
    (supabase.rpc as jest.Mock).mockReset();
    expect(await fetchBacklogQuests(OWNER)).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
