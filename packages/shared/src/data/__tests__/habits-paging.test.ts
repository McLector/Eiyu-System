import { fetchTodayHabits } from '../habits';
import { supabase } from '../../supabase/client';

jest.mock('../../supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

type Row = Record<string, any>;
const MAX_ROWS = 1000; // PostgREST caps every response, with or without a range
const MAX_IDS = 100; // stands in for the request-URL ceiling on an .in() list
const idListSizes: number[] = [];

/** A tiny PostgREST stand-in: filters, ordering, ranges, the row cap, and a URL-size ceiling on .in(). */
function fakeTable(rows: Row[], fail?: (ids: string[]) => boolean) {
  let data = rows, from = 0, to = Infinity, failing = false; const orders: string[] = [];
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => { data = data.filter(row => row[column] === value); return builder; },
    in: (column: string, ids: string[]) => {
      if (ids.length > MAX_IDS) throw new Error(`request URL too long: ${ids.length} ids`);
      idListSizes.push(ids.length); failing = !!fail?.(ids);
      data = data.filter(row => ids.includes(row[column])); return builder;
    },
    lte: (column: string, value: string) => { data = data.filter(row => row[column] <= value); return builder; },
    order: (column: string) => { orders.push(column); return builder; },
    range: (start: number, end: number) => { from = start; to = end; return builder; },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (failing) return Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } }).then(resolve, reject);
      const sorted = orders.length ? [...data].sort((a, b) => orders.reduce((order, column) => order || (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0), 0)) : data;
      return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }).then(resolve, reject);
    },
  };
  return builder;
}
const habit = (i: number): Row => ({
  id: `h-${String(i).padStart(5, '0')}`, user_id: 'user-1', name: `Habit ${i}`, easy_version: null, description: null, quest_type: 'habit', stat: 'STR', difficulty: 'Easy',
  reminder_time: '09:00:00', days: [0, 1, 2, 3, 4, 5, 6], archived: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  scheduled_date: null, target_count: null, schedule_start_on: '2020-01-01',
});
const dayKey = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
function install(habits: Row[], tables: Record<string, Row[]> = {}, fail?: (ids: string[]) => boolean) {
  (supabase.rpc as jest.Mock).mockReset().mockImplementation((name: string) => {
    if (name === 'initialize_account_time_zone') return Promise.resolve({ data: 'UTC', error: null });
    if (name === 'get_open_habit_recoveries') return Promise.resolve({ data: [], error: null });
    if (name === 'get_habits_for_date') return fakeTable(habits);
    throw new Error(`unexpected RPC ${name}`);
  });
  (supabase.from as jest.Mock).mockReset().mockImplementation((name: string) => {
    if (name === 'habits') return fakeTable(habits);
    if (name === 'habit_completions' || name === 'habit_occurrences' || name === 'habit_progress') return fakeTable(tables[name] ?? [], name === 'habit_completions' ? fail : undefined);
    throw new Error(`unexpected table ${name}`);
  });
}

describe('fetchTodayHabits stays complete beyond the API row cap', () => {
  beforeEach(() => { idListSizes.length = 0; });

  it('loads every catalog habit and every habit scheduled for today, once each, past 1,000 rows', async () => {
    const habits = Array.from({ length: 1100 }, (_, i) => habit(i));
    install(habits);
    const quests = await fetchTodayHabits('user-1');
    expect(quests).toHaveLength(1100);
    expect(new Set(quests.map(q => q.id)).size).toBe(1100);
    expect(quests.every(q => q.dailyEligible)).toBe(true);
  });

  it('never sends more than 100 habit ids in one request', async () => {
    install(Array.from({ length: 1100 }, (_, i) => habit(i)));
    await expect(fetchTodayHabits('user-1')).resolves.toHaveLength(1100);
    expect(idListSizes.length).toBeGreaterThan(0);
    expect(Math.max(...idListSizes)).toBeLessThanOrEqual(MAX_IDS);
  });

  it('reads a full history past 1,000 rows so the streak is exact', async () => {
    const days = Array.from({ length: 1400 }, (_, i) => dayKey(i));
    install([habit(1)], {
      habit_occurrences: days.map(d => ({ habit_id: 'h-00001', user_id: 'user-1', occurrence_date: d })),
      habit_completions: days.map(d => ({ habit_id: 'h-00001', user_id: 'user-1', completed_on: d })),
    });
    const [quest] = await fetchTodayHabits('user-1');
    expect(quest.completed).toBe(true);
    expect(quest.streak).toBe(1400);
  });

  it('fails the whole board when any chunk read fails, never returning a partial one', async () => {
    const habits = Array.from({ length: 250 }, (_, i) => habit(i));
    install(habits, {}, ids => ids.includes('h-00230'));
    await expect(fetchTodayHabits('user-1')).rejects.toMatchObject({ message: 'boom' });
  });

  it('returns an empty board without extra reads when there is nothing to show', async () => {
    install([]);
    await expect(fetchTodayHabits('user-1')).resolves.toEqual([]);
    expect(idListSizes).toHaveLength(0);
  });
});
