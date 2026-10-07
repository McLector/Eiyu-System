import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type LongQuest, type Quest } from '@eiyu/shared';
import { Text } from 'react-native';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = {
  archiveHabit: jest.fn(),
  createHabit: jest.fn(),
  deleteHabit: jest.fn(),
  fetchAllActiveHabits: jest.fn(),
  fetchBacklogQuests: jest.fn(),
  moveBacklogToOneTime: jest.fn(),
  moveOneTimeToBacklog: jest.fn(),
  fetchLongQuests: jest.fn(),
  fetchProfile: jest.fn(),
  fetchStats: jest.fn(),
  fetchTodayHabits: jest.fn(),
  fetchTodayOneTimeHabits: jest.fn(),
  fetchUpcomingOneTimeHabits: jest.fn(),
  completeHabitRecovery: jest.fn(),
  incrementHabitProgress: jest.fn(),
  undoCompletion: jest.fn(),
  restoreHabit: jest.fn(),
  updateHabit: jest.fn(),
  reorderQuests: jest.fn(),
  reorderLongQuests: jest.fn(),
};

const mockNative = {
  cancelAllHabitReminders: jest.fn(),
  cancelHabitReminders: jest.fn(),
  ensureNotificationSetup: jest.fn(),
  inspectNotificationPermissions: jest.fn(),
  notifyRecoveryQuestGenerated: jest.fn(),
  requestNotificationPermissions: jest.fn(),
  scheduleHabitReminders: jest.fn(),
  scheduleOneTimeReminder: jest.fn(),
};

const mockPreference = {
  getNotificationsEnabled: jest.fn(),
  setNotificationsEnabled: jest.fn(),
};

type NetworkListener = (state: { isConnected: boolean | null }) => void | Promise<unknown>;
const mockNetwork = {
  getNetworkStateAsync: jest.fn(),
  addNetworkStateListener: jest.fn(),
  // The store and the write queue both listen; tests drive them together through one fan-out.
  listener: null as NetworkListener | null,
  all: [] as NetworkListener[],
};
const mockRegisterListener = (listener: NetworkListener) => {
  mockNetwork.all.push(listener);
  mockNetwork.listener = state => Promise.all(mockNetwork.all.map(each => each(state)));
  return { remove: jest.fn() };
};
mockNetwork.addNetworkStateListener.mockImplementation(mockRegisterListener);
const mockCompleteHabit = jest.fn();

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  completeHabit: mockCompleteHabit,
}));
jest.doMock('@/contexts/auth-store', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.doMock('@/lib/notifications', () => mockNative);
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => ({
  getSoundEffectsEnabled: jest.fn().mockResolvedValue(false),
  setSoundEffectsEnabled: jest.fn().mockResolvedValue(undefined),
}));
installExpoNetworkMock(mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn(), volume: 1 }) }));

// The store must load after the mocks above are registered, so it is required, not imported.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');

const quest = (id: string, position: number, questType: Quest['questType'] = 'backlog'): Quest => ({
  id, name: id, stat: 'WIS', difficulty: 'Easy', easyVersion: null, description: null, questType, archived: false,
  time: '08:00', days: [], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, position,
  dailyEligible: true,
});
const chain = (id: string, position: number): LongQuest => ({
  id, name: id, stat: 'INT', description: null, completedAt: null, position,
  stages: [{ id: `${id}-s`, name: 's', done: false, description: null }],
});

let currentStore: ReturnType<typeof useEiyu> | null = null;
let activeClient: QueryClient | null = null;
function Probe() {
  currentStore = useEiyu();
  return <Text>{currentStore.reminderWarning ?? ''}</Text>;
}

async function mountStore() {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(
    <QueryClientProvider client={activeClient}>
      <EiyuProvider><Probe /></EiyuProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  currentStore = null;
  mockShared.archiveHabit.mockResolvedValue(undefined);
  mockShared.completeHabitRecovery.mockResolvedValue(undefined);
  mockShared.incrementHabitProgress.mockResolvedValue(0);
  mockCompleteHabit.mockResolvedValue(undefined);
  mockShared.undoCompletion.mockResolvedValue(undefined);
  mockShared.createHabit.mockResolvedValue('habit-1');
  mockShared.deleteHabit.mockResolvedValue(undefined);
  mockShared.fetchAllActiveHabits.mockResolvedValue([
    { id: 'habit-1', name: 'Read', time: '08:00', days: [1, 2, 3, 4, 5] },
  ]);
  mockShared.fetchBacklogQuests.mockResolvedValue([quest('b1', 0), quest('b2', 1), quest('b3', 2)]);
  mockShared.moveBacklogToOneTime.mockResolvedValue(undefined);
  mockShared.moveOneTimeToBacklog.mockResolvedValue(undefined);
  mockShared.fetchLongQuests.mockResolvedValue([chain('c1', 0), chain('c2', 1), chain('c3', 2)]);
  mockShared.reorderQuests.mockResolvedValue(undefined);
  mockShared.reorderLongQuests.mockResolvedValue(undefined);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchTodayHabits.mockResolvedValue([quest('h1', 0, 'habit'), quest('h2', 1, 'habit'), quest('h3', 2, 'habit')]);
  mockShared.fetchTodayOneTimeHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  mockShared.restoreHabit.mockResolvedValue(undefined);
  mockShared.updateHabit.mockResolvedValue(undefined);
  mockPreference.getNotificationsEnabled.mockResolvedValue(true);
  mockPreference.setNotificationsEnabled.mockResolvedValue(undefined);
  mockNative.cancelAllHabitReminders.mockResolvedValue(undefined);
  mockNative.cancelHabitReminders.mockResolvedValue(undefined);
  mockNative.ensureNotificationSetup.mockResolvedValue(undefined);
  mockNative.inspectNotificationPermissions.mockResolvedValue(true);
  mockNative.notifyRecoveryQuestGenerated.mockResolvedValue(undefined);
  mockNative.requestNotificationPermissions.mockResolvedValue(true);
  mockNative.scheduleHabitReminders.mockResolvedValue(undefined);
  mockNative.scheduleOneTimeReminder.mockResolvedValue(undefined);
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockNetwork.addNetworkStateListener.mockImplementation(mockRegisterListener);
  mockNetwork.listener = null;
  mockNetwork.all = [];
});

afterEach(async () => {
  cleanup();
  await activeClient?.cancelQueries();
  activeClient?.clear();
  activeClient = null;
  jest.clearAllMocks();
});

const backlogIds = () => currentStore?.backlog.map(q => q.id);
const mounted = async () => {
  await mountStore();
  await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
};

describe('mobile reorderQuests', () => {
  it('shows the new Backlog order at once, before the server answers, then reads again', async () => {
    await mounted();
    let release!: () => void;
    mockShared.reorderQuests.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const reads = mockShared.fetchBacklogQuests.mock.calls.length;
    let done!: Promise<void>;
    await act(async () => { done = currentStore!.reorderQuests('backlog', ['b3', 'b1']); });
    await waitFor(() => expect(backlogIds()).toEqual(['b3', 'b2', 'b1']));
    expect(mockShared.reorderQuests).toHaveBeenCalledWith('backlog', ['b3', 'b1']);
    await act(async () => { release(); await done; });
    await waitFor(() => expect(mockShared.fetchBacklogQuests.mock.calls.length).toBeGreaterThan(reads));
  });

  it('patches the board read for a Daily lane and leaves the other lanes alone', async () => {
    await mounted();
    mockShared.reorderQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    await act(async () => { void currentStore!.reorderQuests('habit', ['h3', 'h1']); });
    await waitFor(() => expect(currentStore?.user.quests.find(q => q.id === 'h3')?.position).toBe(0));
    expect(currentStore?.user.quests.find(q => q.id === 'h1')?.position).toBe(2);
    expect(backlogIds()).toEqual(['b1', 'b2', 'b3']);
  });

  it('reads again to put the old order back, and publishes the failure, when the server refuses', async () => {
    await mounted();
    mockShared.reorderQuests.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    await act(async () => { await expect(currentStore!.reorderQuests('backlog', ['b3', 'b1'])).rejects.toThrow('out of date'); });
    await waitFor(() => expect(currentStore?.questsError).toContain('out of date'));
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2', 'b3']));
  });

  it('sends two moves in one lane one after the other, and still runs the second after a failed first', async () => {
    await mounted();
    const calls: string[] = [];
    let releaseFirst!: () => void;
    mockShared.reorderQuests
      .mockImplementationOnce(() => { calls.push('first:start'); return new Promise<void>((_, reject) => { releaseFirst = () => { calls.push('first:fail'); reject(new Error('nope')); }; }); })
      .mockImplementationOnce(async () => { calls.push('second:start'); });
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = currentStore!.reorderQuests('backlog', ['b2', 'b1']);
      second = currentStore!.reorderQuests('backlog', ['b3', 'b2']);
      first.catch(() => {});
    });
    await waitFor(() => expect(calls).toEqual(['first:start']));
    await act(async () => { releaseFirst(); await first.catch(() => {}); await second; });
    expect(calls).toEqual(['first:start', 'first:fail', 'second:start']);
  });

  it('does not change the cache when a row has no position yet (a database before 044)', async () => {
    mockShared.fetchBacklogQuests.mockResolvedValue([{ ...quest('b1', 0), position: undefined }, quest('b2', 1)]);
    await mountStore();
    await waitFor(() => expect(backlogIds()).toEqual(['b1', 'b2']));
    mockShared.reorderQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    await act(async () => { void currentStore!.reorderQuests('backlog', ['b2', 'b1']); });
    expect(backlogIds()).toEqual(['b1', 'b2']);
  });
});

describe('mobile reorderChains', () => {
  it('shows the new chain order at once and calls the server with the given ids', async () => {
    await mounted();
    await waitFor(() => expect(currentStore?.user.longQuests.map(q => q.id)).toEqual(['c1', 'c2', 'c3']));
    mockShared.reorderLongQuests.mockImplementationOnce(() => new Promise<void>(() => {}));
    await act(async () => { void currentStore!.reorderChains(['c3', 'c1']); });
    await waitFor(() => expect(currentStore?.user.longQuests.map(q => q.id)).toEqual(['c3', 'c2', 'c1']));
    expect(mockShared.reorderLongQuests).toHaveBeenCalledWith(['c3', 'c1']);
  });

  it('reads the chains again and publishes the failure when the server refuses', async () => {
    await mounted();
    await waitFor(() => expect(currentStore?.user.longQuests).toHaveLength(3));
    mockShared.reorderLongQuests.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    await act(async () => { await expect(currentStore!.reorderChains(['c3', 'c1'])).rejects.toThrow('out of date'); });
    await waitFor(() => expect(currentStore?.longQuestsError).toContain('out of date'));
    await waitFor(() => expect(currentStore?.user.longQuests.map(q => q.id)).toEqual(['c1', 'c2', 'c3']));
  });
});
