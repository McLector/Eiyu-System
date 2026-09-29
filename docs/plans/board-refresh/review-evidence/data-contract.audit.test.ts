// Review-only deterministic transport/interleaving probes. These do not prove RLS.
import { beforeEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../../packages/shared/src/supabase/client', () => ({ supabase: transport }));
import { fetchTodayHabits, updateHabit } from '../../../../packages/shared/src/data/habits';
import { fetchWeeklyReview, weeklyStatTotal } from '../../../../packages/shared/src/data/weekly-review';
import { fetchHistoryRange } from '../../../../packages/shared/src/data/history';

function query(rows: Record<string, unknown>[], cap = Infinity, afterRead = () => {}) {
  let selected = [...rows];
  const result = { error: null, data: selected };
  const builder: any = {
    select: () => builder,
    eq: (key: string, value: unknown) => { selected = selected.filter(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { selected = selected.filter(row => values.includes(row[key])); return builder; },
    gte: () => builder, lte: () => builder, lt: () => builder,
    update: () => builder,
    then: (resolve: (value: unknown) => unknown) => {
      const snapshot = { ...result, data: selected.slice(0, cap) };
      afterRead();
      return Promise.resolve(snapshot).then(resolve);
    },
  };
  return builder;
}
beforeEach(() => {
  transport.from.mockReset();
  transport.rpc.mockReset().mockImplementation((name: string) => Promise.resolve({
    error: null, data: name === 'initialize_account_time_zone' ? 'UTC' : [],
  }));
});
it('D01: board retrieval retains archived one-time definitions', async () => {
  const base = { user_id: 'review-user', name: 'Archived', archived: true, reminder_time: '08:00:00',
    stat: 'STR', difficulty: 'Easy', easy_version: 'One minute', days: [0,1,2,3,4,5,6], target_count: null };
  transport.from.mockImplementation((table: string) => query(table === 'habits' ? [
    { ...base, id: 'recurring', quest_type: 'habit' },
    { ...base, id: 'one-time', quest_type: 'one_time' },
  ] : []));
  const result = await fetchTodayHabits('review-user');
  expect(result.map(q => q.id)).toContain('one-time');
});
it('D02: stale editor update rejects a definition deleted on another device', async () => {
  // PostgREST without return=representation reports no error for UPDATE 0.
  transport.from.mockReturnValue(query([]));
  await expect(updateHabit('deleted-elsewhere', {
    name: 'Stale', easyVersion: 'One minute', stat: 'STR', difficulty: 'Easy', time: '08:00', days: [1],
  })).rejects.toThrow();
});
it('D03: a history read spanning deletion retains the completion', async () => {
  const definition = { id: 'moved', user_id: 'review-user', name: 'Moved', quest_type: 'habit' };
  const state: Record<string, Record<string, unknown>[]> = {
    habits: [definition],
    deleted_habit_history: [],
    habit_occurrences: [{ habit_id: 'moved', user_id: 'review-user', occurrence_date: '2026-09-20' }],
    habit_completions: [{ habit_id: 'moved', user_id: 'review-user', completed_on: '2026-09-20', kind: 'full' }],
  };
  expect(state.habit_completions).toHaveLength(1);
  transport.from.mockImplementation((table: string) => {
    // Valid transaction interleaving: definition and ledger read before delete
    // commits; occurrence and completion reads after the commit. No data loss
    // occurs in storage, but this reader never observes the retained row.
    return query(state[table], Infinity, () => {
      if (table !== 'deleted_habit_history') return;
      state.deleted_habit_history = [{ user_id: 'review-user', source_habit_id: 'moved', historical_date: '2026-09-20', habit_name: 'Moved', quest_type: 'habit', scheduled: true, completion_kind: 'full' }];
      state.habits = [];
      state.habit_occurrences = [];
      state.habit_completions = [];
    });
  });
  const result = await fetchHistoryRange('review-user', new Date('2026-09-20T00:00:00Z'), new Date('2026-09-21T00:00:00Z'));
  expect(state.deleted_habit_history).toHaveLength(1);
  expect(result['2026-09-20'].completedCount).toBe(1);
});
it('D04: weekly review does not silently truncate retained completions at the configured API cap', async () => {
  const rows = Array.from({ length: 1100 }, (_, i) => ({
    user_id: 'review-user', source_habit_id: `deleted-${i}`, historical_date: '2026-09-20', stat: 'STR', completion_kind: 'full',
  }));
  // supabase/config.toml sets max_rows=1000. The production reader requests no pages.
  transport.from.mockImplementation((table: string) => query(table === 'deleted_habit_history' ? rows : [], 1000));
  const result = await fetchWeeklyReview('review-user', 'UTC', new Date('2026-09-20T12:00:00Z'));
  expect(weeklyStatTotal(result, 'STR')).toBe(1100);
});
