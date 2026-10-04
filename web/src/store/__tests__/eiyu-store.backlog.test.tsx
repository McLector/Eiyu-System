// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  fetchBacklogQuests: vi.fn(),
  moveBacklogToOneTime: vi.fn(),
  moveOneTimeToBacklog: vi.fn(),
  deleteHabit: vi.fn(),
  fetchLongQuests: vi.fn(),
  fetchProfile: vi.fn(),
  fetchStats: vi.fn(),
  fetchTodayHabits: vi.fn(),
}));

vi.mock('@eiyu/shared', async () => ({
  ...(await vi.importActual<typeof import('@eiyu/shared')>('@eiyu/shared')),
  ...shared,
}));
vi.mock('../session-context', () => ({ useSession: () => ({ session: { user: { id: 'user-1' } } }) }));

import { EiyuProvider, useEiyu } from '../eiyu-store';

const idea = (id: string): Quest => ({
  id, name: `Idea ${id}`, stat: 'INT', difficulty: 'Easy', easyVersion: null, description: null, questType: 'backlog',
  genre: 'tool', timeSet: false, archived: false, time: '08:00', days: [], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0,
});

let store: ReturnType<typeof useEiyu> | null = null;
function Probe() { store = useEiyu(); return null; }
function renderStore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  store = null;
  shared.fetchTodayHabits.mockResolvedValue([]);
  shared.fetchBacklogQuests.mockResolvedValue([idea('b1')]);
  shared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  shared.fetchStats.mockResolvedValue(initialUser.stats);
  shared.fetchLongQuests.mockResolvedValue([]);
  shared.moveBacklogToOneTime.mockResolvedValue(undefined);
  shared.moveOneTimeToBacklog.mockResolvedValue(undefined);
  shared.deleteHabit.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('Backlog in the web store', () => {
  it('loads Backlog quests after the board read, so a server rollover is already applied', async () => {
    const order: string[] = [];
    shared.fetchTodayHabits.mockImplementation(async () => { order.push('board'); return []; });
    shared.fetchBacklogQuests.mockImplementation(async () => { order.push('backlog'); return [idea('b1')]; });
    renderStore();
    await waitFor(() => expect(store?.backlog.map(q => q.id)).toEqual(['b1']));
    expect(order).toEqual(['board', 'backlog']);
  });

  it('single-flights a repeated move, refreshes both lists, and shares one promise', async () => {
    const client = renderStore();
    await waitFor(() => expect(store?.backlog).toHaveLength(1));
    let release!: () => void;
    shared.moveBacklogToOneTime.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = store!.moveToOneTime('b1');
    const second = store!.moveToOneTime('b1');
    expect(first).toBe(second);
    expect(shared.moveBacklogToOneTime).toHaveBeenCalledTimes(1);
    const invalidated = vi.spyOn(client, 'invalidateQueries');
    release();
    await first;
    const keys = invalidated.mock.calls.map(call => (call[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(['habits', 'backlog']));
  });

  it('publishes a failed move through the board error state and rethrows', async () => {
    renderStore();
    await waitFor(() => expect(store?.backlog).toHaveLength(1));
    shared.moveOneTimeToBacklog.mockRejectedValueOnce(new Error('quest has a completion'));
    await expect(store!.moveToBacklog('t1')).rejects.toThrow('quest has a completion');
    await waitFor(() => expect(store?.questsError).toContain('quest has a completion'));
  });

  it('drops a deleted Backlog quest from the cache immediately', async () => {
    const client = renderStore();
    await waitFor(() => expect(store?.backlog).toHaveLength(1));
    shared.fetchBacklogQuests.mockResolvedValue([]);
    await store!.deleteQuest('b1');
    expect(client.getQueryData(['backlog', 'user-1'])).toEqual([]);
  });
});
