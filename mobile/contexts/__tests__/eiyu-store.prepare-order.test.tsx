import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, waitFor } from '@testing-library/react-native';
import { initialUser } from '@eiyu/shared';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';
import { trackerAccess } from '@/test-support/tracker-fixtures';
import { renderWithTheme } from '@/components/ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockOrder: string[] = [];
let mockFocusEffect: (() => unknown) | null = null;
const mockShared = {
  fetchTrackerAccess: jest.fn(), prepareDay: jest.fn(), subscribeTrackerAccessChanges: jest.fn(), trackerErrorKind: jest.fn(),
  fetchTodayHabits: jest.fn(), fetchBacklogQuests: jest.fn(), fetchLongQuests: jest.fn(), fetchProfile: jest.fn(), fetchStats: jest.fn(),
  fetchAllActiveHabits: jest.fn(), fetchUpcomingOneTimeHabits: jest.fn(),
  fetchHistoryRange: jest.fn(), fetchMonthHistory: jest.fn(),
};
const mockQueue = {
  enqueue: jest.fn(), flush: jest.fn(), sweep: jest.fn(), retry: jest.fn(), dismiss: jest.fn(),
};
const mockNetwork = { getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() };

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  copyTrackerRevision: (revision: object) => ({ ...revision }),
  ...mockShared,
}));
jest.doMock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => { mockFocusEffect = callback; } }));
jest.doMock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'owner-a' } } }) }));
jest.doMock('@/lib/notifications', () => ({
  cancelAllHabitReminders: jest.fn().mockResolvedValue(undefined), ensureNotificationSetup: jest.fn().mockResolvedValue(undefined),
  inspectNotificationPermissions: jest.fn().mockResolvedValue(true), notifyRecoveryQuestGenerated: jest.fn().mockResolvedValue(undefined),
  requestNotificationPermissions: jest.fn().mockResolvedValue(true), scheduleHabitReminders: jest.fn().mockResolvedValue(undefined),
  scheduleOneTimeReminder: jest.fn().mockResolvedValue(undefined),
  filterReminderRows: jest.requireActual('@/lib/notifications').filterReminderRows,
}));
jest.doMock('@/lib/notification-prefs', () => ({
  getNotificationsEnabled: jest.fn().mockResolvedValue(false), setNotificationsEnabled: jest.fn().mockResolvedValue(undefined),
}));
jest.doMock('@/lib/sound-effects-prefs', () => ({
  getSoundEffectsEnabled: jest.fn().mockResolvedValue(false), setSoundEffectsEnabled: jest.fn().mockResolvedValue(undefined),
}));
jest.doMock('@/lib/use-write-queue', () => ({
  useWriteQueue: () => ({ entries: [], offline: false, enqueue: mockQueue.enqueue, flush: mockQueue.flush, sweep: mockQueue.sweep, retry: mockQueue.retry, dismiss: mockQueue.dismiss }),
}));
installExpoNetworkMock(mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn(), volume: 1 }) }));

const { EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');
const HabitHeatmap = (require('@/components/status/habit-heatmap') as typeof import('@/components/status/habit-heatmap')).default;
const { HistorySheet } = require('@/components/status/history-sheet') as typeof import('@/components/status/history-sheet');

const PREPARED = { basicPrepared: true, protectedPrepared: true, accessChanged: false };
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });

/** A preparation call the test finishes (or fails) by hand. */
function slowPreparation() {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  mockShared.prepareDay.mockImplementation(() => new Promise((resolve, reject) => {
    mockOrder.push('prepare-started');
    finish = () => { mockOrder.push('prepare-finished'); resolve(PREPARED); };
    fail = (error: Error) => { mockOrder.push('prepare-failed'); reject(error); };
  }));
  return { finish: () => finish(), fail: (error: Error) => fail(error) };
}

let activeClient: QueryClient | null = null;
async function mount(child: 'heatmap' | 'history' = 'heatmap') {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const page = child === 'heatmap'
    ? <HabitHeatmap userId="owner-a" timeZone="UTC" />
    : <HistorySheet visible userId="owner-a" timeZone="UTC" onClose={() => undefined} />;
  await renderWithTheme(<QueryClientProvider client={activeClient}><EiyuProvider>{page}</EiyuProvider></QueryClientProvider>);
  return activeClient;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockFocusEffect = null;
  for (const fn of [...Object.values(mockShared), ...Object.values(mockQueue), ...Object.values(mockNetwork)]) if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  mockOrder.length = 0;
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockNetwork.addNetworkStateListener.mockImplementation(() => ({ remove: jest.fn() }));
  mockShared.subscribeTrackerAccessChanges.mockReturnValue(() => undefined);
  mockShared.trackerErrorKind.mockReturnValue(null);
  mockShared.fetchTrackerAccess.mockImplementation(async () => trackerAccess({}, 'owner-a'));
  mockShared.prepareDay.mockImplementation(async () => { mockOrder.push('prepare'); return PREPARED; });
  mockShared.fetchTodayHabits.mockResolvedValue([]);
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'A', userClass: 'Hunter', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  mockShared.fetchHistoryRange.mockImplementation(async () => { mockOrder.push('history'); return {}; });
  mockShared.fetchMonthHistory.mockImplementation(async () => { mockOrder.push('history'); return {}; });
  mockQueue.enqueue.mockReturnValue(true);
  mockQueue.flush.mockResolvedValue(undefined);
  mockQueue.retry.mockResolvedValue(true);
});
afterEach(async () => {
  cleanup();
  await activeClient?.cancelQueries();
  activeClient?.clear();
  activeClient = null;
});

describe('history waits for the first day preparation', () => {
  it('does not read the Status heatmap until preparation has finished', async () => {
    const prep = slowPreparation();
    await mount('heatmap');
    await waitFor(() => expect(mockShared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(mockShared.fetchHistoryRange).not.toHaveBeenCalled();
    prep.finish();
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(mockOrder.indexOf('prepare-finished')).toBeLessThan(mockOrder.indexOf('history'));
  });

  it('does not read a month of History until preparation has finished', async () => {
    const prep = slowPreparation();
    await mount('history');
    await waitFor(() => expect(mockShared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(mockShared.fetchMonthHistory).not.toHaveBeenCalled();
    prep.finish();
    await waitFor(() => expect(mockShared.fetchMonthHistory).toHaveBeenCalledTimes(1));
    expect(mockOrder.indexOf('prepare-finished')).toBeLessThan(mockOrder.indexOf('history'));
  });

  it('still reads history when preparation fails, so a failed preparation never blocks reading', async () => {
    const prep = slowPreparation();
    await mount('heatmap');
    await waitFor(() => expect(mockShared.prepareDay).toHaveBeenCalledTimes(1));
    await tick();
    expect(mockShared.fetchHistoryRange).not.toHaveBeenCalled();
    prep.fail(new Error('network down'));
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
  });

  it('still reads history when the access read that comes before preparation fails', async () => {
    mockShared.fetchTrackerAccess.mockRejectedValue(new Error('access unavailable'));
    await mount('heatmap');
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(mockShared.prepareDay).not.toHaveBeenCalled();
  });

  it('still reads history when the board read itself fails', async () => {
    mockShared.fetchTodayHabits.mockRejectedValue(new Error('board unavailable'));
    await mount('heatmap');
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
  });

  it('does not wait again when the screen regains focus while a new preparation is running', async () => {
    const client = await mount('heatmap');
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    slowPreparation(); // the next preparation never finishes
    await act(async () => { void client.invalidateQueries(); });
    await waitFor(() => expect(mockShared.prepareDay).toHaveBeenCalledTimes(2));
    await act(async () => { mockFocusEffect?.(); });
    await waitFor(() => expect(mockShared.fetchHistoryRange.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('reads history when the board answer is already cached and no preparation is coming', async () => {
    activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
    activeClient.setQueryData(['habits', 'today', 'owner-a'], []);
    await renderWithTheme(<QueryClientProvider client={activeClient}><EiyuProvider><HabitHeatmap userId="owner-a" timeZone="UTC" /></EiyuProvider></QueryClientProvider>);
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(mockShared.prepareDay).not.toHaveBeenCalled();
  });

  it('reads history at once when the page is used with no store around it', async () => {
    activeClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderWithTheme(<QueryClientProvider client={activeClient}><HabitHeatmap userId="owner-a" timeZone="UTC" /></QueryClientProvider>);
    await waitFor(() => expect(mockShared.fetchHistoryRange).toHaveBeenCalledTimes(1));
    expect(mockShared.prepareDay).not.toHaveBeenCalled();
  });
});
