// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialUser } from '@eiyu/shared';

const shared = vi.hoisted(() => ({
  session: { user: { id: 'owner-a' } } as { user: { id: string } } | null,
  order: [] as string[],
  fetchTrackerAccess: vi.fn(), prepareDay: vi.fn(), subscribe: vi.fn(), kind: vi.fn(),
  fetchTodayHabits: vi.fn(), fetchBacklogQuests: vi.fn(), fetchLongQuests: vi.fn(), fetchProfile: vi.fn(), fetchStats: vi.fn(),
  fetchHistoryRange: vi.fn(), fetchMonthHistory: vi.fn(),
}));

vi.mock('@eiyu/shared', async () => ({
  ...(await vi.importActual<typeof import('@eiyu/shared')>('@eiyu/shared')),
  fetchTrackerAccess: shared.fetchTrackerAccess,
  prepareDay: shared.prepareDay,
  subscribeTrackerAccessChanges: shared.subscribe,
  trackerErrorKind: shared.kind,
  fetchTodayHabits: shared.fetchTodayHabits, fetchBacklogQuests: shared.fetchBacklogQuests, fetchLongQuests: shared.fetchLongQuests,
  fetchProfile: shared.fetchProfile, fetchStats: shared.fetchStats,
  fetchHistoryRange: shared.fetchHistoryRange, fetchMonthHistory: shared.fetchMonthHistory,
}));
vi.mock('../session-context', () => ({ useSession: () => ({ session: shared.session }) }));

import { EiyuProvider } from '../eiyu-store';
import WebHeatmap from '../../web/WebHeatmap';
import WebHistory from '../../web/WebHistory';
import { trackerAccess } from '../../test/tracker-fixtures';

const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
const PREPARED = { basicPrepared: true, protectedPrepared: true, accessChanged: false };

/** A preparation call the test finishes (or fails) by hand. */
function slowPreparation() {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  shared.prepareDay.mockImplementation(() => new Promise((resolve, reject) => {
    shared.order.push('prepare-started');
    finish = () => { shared.order.push('prepare-finished'); resolve(PREPARED); };
    fail = (error: Error) => { shared.order.push('prepare-failed'); reject(error); };
  }));
  return { finish: () => finish(), fail: (error: Error) => fail(error) };
}

function mount(child: 'heatmap' | 'history' | 'none' = 'heatmap') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = child === 'heatmap' ? <WebHeatmap userId="owner-a" timeZone="UTC" />
    : child === 'history' ? <WebHistory userId="owner-a" timeZone="UTC" onClose={() => undefined} /> : null;
  render(<QueryClientProvider client={client}><EiyuProvider>{page}</EiyuProvider></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  shared.session = { user: { id: 'owner-a' } };
  for (const fn of Object.values(shared)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  shared.order.length = 0;
  shared.subscribe.mockReturnValue(() => undefined);
  shared.kind.mockReturnValue(null);
  shared.fetchTrackerAccess.mockImplementation(async () => trackerAccess({}, 'owner-a'));
  shared.prepareDay.mockImplementation(async () => { shared.order.push('prepare'); return PREPARED; });
  shared.fetchTodayHabits.mockResolvedValue([]);
  shared.fetchBacklogQuests.mockResolvedValue([]);
  shared.fetchLongQuests.mockResolvedValue([]);
  shared.fetchProfile.mockResolvedValue({ displayName: 'A', userClass: 'Hunter', timeZone: 'UTC' });
  shared.fetchStats.mockResolvedValue(initialUser.stats);
  shared.fetchHistoryRange.mockImplementation(async () => { shared.order.push('history'); return {}; });
  shared.fetchMonthHistory.mockImplementation(async () => { shared.order.push('history'); return {}; });
});
afterEach(cleanup);

describe('history waits for the first day preparation', () => {
  it('does not read the Status heatmap until preparation has finished', async () => {
    const prep = slowPreparation();
    mount('heatmap');
    await waitFor(() => expect(shared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(shared.fetchHistoryRange).not.toHaveBeenCalled();
    prep.finish();
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(shared.order.indexOf('prepare-finished')).toBeLessThan(shared.order.indexOf('history'));
  });

  it('does not read a month of History until preparation has finished', async () => {
    const prep = slowPreparation();
    mount('history');
    await waitFor(() => expect(shared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(shared.fetchMonthHistory).not.toHaveBeenCalled();
    prep.finish();
    await waitFor(() => expect(shared.fetchMonthHistory).toHaveBeenCalledTimes(1));
    expect(shared.order.indexOf('prepare-finished')).toBeLessThan(shared.order.indexOf('history'));
  });

  it('still reads history when preparation fails, so a failed preparation never blocks reading', async () => {
    const prep = slowPreparation();
    mount('heatmap');
    await waitFor(() => expect(shared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(shared.fetchHistoryRange).not.toHaveBeenCalled();
    prep.fail(new Error('network down'));
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
  });

  it('still reads history when the access read that comes before preparation fails', async () => {
    shared.fetchTrackerAccess.mockRejectedValue(new Error('access unavailable'));
    mount('heatmap');
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(shared.prepareDay).not.toHaveBeenCalled();
  });

  it('still reads history when the board read itself fails', async () => {
    shared.fetchTodayHabits.mockRejectedValue(new Error('board unavailable'));
    mount('heatmap');
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
  });

  it('does not wait again on a later refetch while a new preparation is running', async () => {
    const client = mount('heatmap');
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    slowPreparation(); // the next preparation never finishes
    await act(async () => { void client.invalidateQueries(); });
    await waitFor(() => expect(shared.prepareDay).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(2));
  });

  it('reads history at once when the page is used with no store around it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WebHeatmap userId="owner-a" timeZone="UTC" /></QueryClientProvider>);
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(shared.prepareDay).not.toHaveBeenCalled();
  });

  it('prepares exactly once for the first read, with or without a history page on screen', async () => {
    mount('heatmap');
    await waitFor(() => expect(shared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(shared.prepareDay).toHaveBeenCalledTimes(1);
  });
});
