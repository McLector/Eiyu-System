// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initialUser, type LongQuest, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  fetchBacklogQuests: vi.fn(),
  fetchLongQuests: vi.fn(),
  fetchProfile: vi.fn(),
  fetchStats: vi.fn(),
  fetchTodayHabits: vi.fn(),
  reorderQuests: vi.fn(),
  reorderLongQuests: vi.fn(),
}));

vi.mock('@eiyu/shared', async () => ({
  ...(await vi.importActual<typeof import('@eiyu/shared')>('@eiyu/shared')),
  ...shared,
}));
vi.mock('../session-context', () => ({ useSession: () => ({ session: { user: { id: 'user-1' } } }) }));

import { EiyuProvider, useEiyu } from '../eiyu-store';

const quest = (id: string, position: number, questType: Quest['questType'] = 'backlog'): Quest => ({
  id, name: id, stat: 'INT', difficulty: 'Easy', easyVersion: null, description: null, questType, position,
  genre: null, timeSet: false, archived: false, time: '08:00', days: [], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0, dailyEligible: true,
});
const chain = (id: string, position: number): LongQuest => ({
  id, name: id, stat: 'INT', description: null, completedAt: null, position,
  stages: [{ id: `${id}-s`, name: 's', done: false, description: null }],
});

let store: ReturnType<typeof useEiyu> | null = null;
function Probe() { store = useEiyu(); return null; }
function renderStore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
  return client;
}
const backlogIds = () => store?.backlog.map(q => q.id);

beforeEach(() => {
  store = null;
  shared.fetchTodayHabits.mockResolvedValue([quest('h1', 0, 'habit'), quest('h2', 1, 'habit'), quest('h3', 2, 'habit')]);
  shared.fetchBacklogQuests.mockResolvedValue([quest('b1', 0), quest('b2', 1), quest('b3', 2)]);
  shared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  shared.fetchStats.mockResolvedValue(initialUser.stats);
  shared.fetchLongQuests.mockResolvedValue([chain('c1', 0), chain('c2', 1), chain('c3', 2)]);
  shared.reorderQuests.mockResolvedValue(undefined);
  shared.reorderLongQuests.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('reorderQuests in the web store', () => {
  it('shows the new Backlog order at once, before the server answers, then refreshes from the server', async () => {
    const client = renderStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
    let release!: () => void;
    shared.reorderQuests.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const done = store!.reorderQuests('backlog', ['b3', 'b1']);
    await waitFor(() => expect(backlogIds()).toEqual(['b3', 'b2', 'b1']));
    expect(shared.reorderQuests).toHaveBeenCalledWith('backlog', ['b3', 'b1']);
    const invalidated = vi.spyOn(client, 'invalidateQueries');
    release();
    await done;
    expect(invalidated.mock.calls.map(call => (call[0] as { queryKey: unknown[] }).queryKey[0])).toContain('backlog');
  });

  it('patches the board read for a Daily lane, leaving other lanes alone', async () => {
    renderStore();
    await waitFor(() => expect(store?.user.quests.map(q => q.id)).toEqual(['h1', 'h2', 'h3']));
    shared.reorderQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    void store!.reorderQuests('habit', ['h3', 'h1']);
    await waitFor(() => expect(store?.user.quests.find(q => q.id === 'h3')?.position).toBe(0));
    expect(store?.user.quests.find(q => q.id === 'h1')?.position).toBe(2);
    expect(store?.user.quests.find(q => q.id === 'h2')?.position).toBe(1);
    expect(backlogIds()).toEqual(['b1', 'b2', 'b3']);
  });

  it('puts the old order back by reading again, and publishes the failure, when the server refuses', async () => {
    renderStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
    shared.reorderQuests.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    await expect(store!.reorderQuests('backlog', ['b3', 'b1'])).rejects.toThrow('out of date');
    await waitFor(() => expect(store?.questsError).toContain('out of date'));
    expect(shared.fetchBacklogQuests.mock.calls.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
  });

  it('sends two moves in the same lane one after the other, in the order they were made', async () => {
    renderStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
    const calls: string[] = [];
    let releaseFirst!: () => void;
    shared.reorderQuests
      .mockImplementationOnce(() => { calls.push('first:start'); return new Promise<void>(resolve => { releaseFirst = () => { calls.push('first:end'); resolve(); }; }); })
      .mockImplementationOnce(async () => { calls.push('second:start'); });
    const first = store!.reorderQuests('backlog', ['b2', 'b1']);
    const second = store!.reorderQuests('backlog', ['b3', 'b2']);
    await waitFor(() => expect(calls).toEqual(['first:start']));
    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('still runs the next move after a failed one', async () => {
    renderStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
    shared.reorderQuests.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined);
    const first = store!.reorderQuests('backlog', ['b2', 'b1']);
    const second = store!.reorderQuests('backlog', ['b3', 'b1']);
    await expect(first).rejects.toThrow('nope');
    await expect(second).resolves.toBeUndefined();
    expect(shared.reorderQuests).toHaveBeenCalledTimes(2);
  });

  it('does not touch the cache when a row has no position yet (a database before 044)', async () => {
    shared.fetchBacklogQuests.mockResolvedValue([{ ...quest('b1', 0), position: undefined }, quest('b2', 1)]);
    renderStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2']));
    shared.reorderQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    void store!.reorderQuests('backlog', ['b2', 'b1']);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(backlogIds()).toEqual(['b1', 'b2']);
  });
});

describe('reorderChains in the web store', () => {
  it('shows the new chain order at once and calls the server with the given ids', async () => {
    renderStore();
    await waitFor(() => expect(store?.user.longQuests.map(q => q.id)).toEqual(['c1', 'c2', 'c3']));
    shared.reorderLongQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    void store!.reorderChains(['c3', 'c1']);
    await waitFor(() => expect(store?.user.longQuests.map(q => q.id)).toEqual(['c3', 'c2', 'c1']));
    expect(shared.reorderLongQuests).toHaveBeenCalledWith(['c3', 'c1']);
  });

  it('reads the chains again and publishes the failure when the server refuses', async () => {
    renderStore();
    await waitFor(() => expect(store?.user.longQuests).toHaveLength(3));
    shared.reorderLongQuests.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    await expect(store!.reorderChains(['c3', 'c1'])).rejects.toThrow('out of date');
    await waitFor(() => expect(store?.longQuestsError).toContain('out of date'));
    await waitFor(() => expect(store?.user.longQuests.map(q => q.id)).toEqual(['c1', 'c2', 'c3']));
  });
});
