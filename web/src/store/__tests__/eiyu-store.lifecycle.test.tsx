// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initialUser, type HabitInput, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  archiveHabit: vi.fn(),
  deleteHabit: vi.fn(),
  restoreHabit: vi.fn(),
  fetchBacklogQuests: vi.fn(),
  fetchLongQuests: vi.fn(),
  fetchProfile: vi.fn(),
  fetchStats: vi.fn(),
  fetchTodayHabits: vi.fn(),
  updateHabit: vi.fn(),
}));

vi.mock('@eiyu/shared', async () => ({
  ...(await vi.importActual<typeof import('@eiyu/shared')>('@eiyu/shared')),
  ...shared,
}));

vi.mock('../session-context', () => ({
  useSession: () => ({ session: { user: { id: 'user-1' } } }),
}));

import { EiyuProvider, useEiyu } from '../eiyu-store';

const quest: Quest = {
  id: 'habit-1',
  name: 'Morning walk',
  stat: 'STR',
  difficulty: 'Medium',
  easyVersion: 'Walk for one minute',
  description: null,
  questType: 'habit',
  archived: false,
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  streak: 0,
  frozen: false,
  completed: false,
  targetCount: null,
  progressCount: 0,
};

const input: HabitInput = {
  name: 'Morning walk',
  easyVersion: 'Walk for one minute',
  description: null,
  questType: 'habit',
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  stat: 'STR',
  difficulty: 'Medium',
  targetCount: null,
};

let latestStore: ReturnType<typeof useEiyu> | null = null;
function Probe() {
  latestStore = useEiyu();
  return null;
}

function renderStore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['habits', 'today', 'user-1'], [quest]);
  render(
    <QueryClientProvider client={client}>
      <EiyuProvider><Probe /></EiyuProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  latestStore = null;
  shared.archiveHabit.mockResolvedValue(undefined);
  shared.restoreHabit.mockResolvedValue(undefined);
  shared.deleteHabit.mockResolvedValue(undefined);
  shared.updateHabit.mockResolvedValue(undefined);
  shared.fetchTodayHabits.mockResolvedValue([quest]);
  shared.fetchProfile.mockResolvedValue({ displayName: 'Test User', userClass: 'Ranger', timeZone: 'UTC' });
  shared.fetchStats.mockResolvedValue(initialUser.stats);
  shared.fetchBacklogQuests.mockResolvedValue([]);
  shared.fetchLongQuests.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe('web lifecycle store boundary', () => {
  it('single-flights repeated delete calls, evicts the cache, and blocks stale editor saves', async () => {
    const client = renderStore();
    await waitFor(() => expect(latestStore).not.toBeNull());

    let release!: () => void;
    shared.deleteHabit.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    shared.fetchTodayHabits.mockResolvedValueOnce([]);
    const first = latestStore!.deleteQuest('habit-1');
    const second = latestStore!.deleteQuest('habit-1');

    expect(first).toBe(second);
    expect(shared.deleteHabit).toHaveBeenCalledTimes(1);
    release();
    await first;

    expect(client.getQueryData(['habits', 'today', 'user-1'])).toEqual([]);
    await expect(latestStore!.saveHabit(input, 'habit-1')).rejects.toThrow('This quest was deleted');
    expect(shared.updateHabit).not.toHaveBeenCalled();
  });
});
