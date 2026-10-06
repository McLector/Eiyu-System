import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
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

const { useEiyu, EiyuProvider, invalidateForNewDay } = require('../eiyu-store') as typeof import('../eiyu-store');

const quest: Quest = {
  id: 'habit-1', name: 'Read', stat: 'WIS', difficulty: 'Easy', easyVersion: 'Read one page',
  description: null, questType: 'habit', archived: true, time: '08:00', days: [1, 2, 3, 4, 5],
  streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
};

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
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.moveBacklogToOneTime.mockResolvedValue(undefined);
  mockShared.moveOneTimeToBacklog.mockResolvedValue(undefined);
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchTodayHabits.mockResolvedValue([quest]);
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

describe('mobile lifecycle reminder permission policy', () => {
  it('restores a quest with granted permission without asking the OS again', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.inspectNotificationPermissions).toHaveBeenCalled());
    mockNative.inspectNotificationPermissions.mockClear();
    mockNative.requestNotificationPermissions.mockClear();

    await act(async () => { await currentStore!.restoreQuest('habit-1'); });

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1');
    expect(mockNative.inspectNotificationPermissions).toHaveBeenCalledTimes(1);
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['denied', false],
    ['undetermined', false],
  ])('keeps %s restore successful without an OS prompt', async (_state, granted) => {
    mockNative.inspectNotificationPermissions.mockResolvedValue(granted);
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.inspectNotificationPermissions).toHaveBeenCalled());
    mockNative.inspectNotificationPermissions.mockClear();
    mockNative.requestNotificationPermissions.mockClear();

    await act(async () => { await expect(currentStore!.restoreQuest('habit-1')).resolves.toBeUndefined(); });

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1');
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/restored.*reminders/i));
  });

  it('does not inspect OS permission when reminders are disabled', async () => {
    mockPreference.getNotificationsEnabled.mockResolvedValue(false);
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.cancelAllHabitReminders).toHaveBeenCalled());

    await act(async () => { await currentStore!.restoreQuest('habit-1'); });

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1');
    expect(mockNative.inspectNotificationPermissions).not.toHaveBeenCalled();
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it('keeps restore successful and reports scheduler failures separately', async () => {
    mockNative.scheduleHabitReminders.mockRejectedValue(new Error('scheduler unavailable'));
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.scheduleHabitReminders).toHaveBeenCalled());
    mockNative.scheduleHabitReminders.mockClear();

    await act(async () => { await expect(currentStore!.restoreQuest('habit-1')).resolves.toBeUndefined(); });

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1');
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/restored.*scheduler unavailable/i));
  });

  it('finishes an older sync before archive cleanup so it cannot re-arm the archived quest', async () => {
    let releaseFetch!: () => void;
    mockShared.fetchAllActiveHabits.mockImplementationOnce(() => new Promise(resolve => {
      releaseFetch = () => resolve([{ id: 'habit-1', name: 'Read', time: '08:00', days: [1] }]);
    }));
    mockShared.fetchAllActiveHabits.mockResolvedValue([]);
    await mountStore();
    await waitFor(() => expect(mockShared.fetchAllActiveHabits).toHaveBeenCalled());

    let archive!: Promise<void>;
    await act(async () => { archive = currentStore!.archiveQuest('habit-1'); });
    expect(mockShared.archiveHabit).toHaveBeenCalledWith('habit-1');
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(1);

    await act(async () => { releaseFetch(); await archive; });
    expect(mockNative.scheduleHabitReminders).toHaveBeenCalled();
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(2);
    expect(mockNative.scheduleHabitReminders.mock.invocationCallOrder.at(-1))
      .toBeLessThan(mockNative.cancelAllHabitReminders.mock.invocationCallOrder[1]);
  });

  it('reconciles stale OS notifications on Retry after archive cleanup fails', async () => {
    await mountStore();
    await waitFor(() => expect(mockNative.inspectNotificationPermissions).toHaveBeenCalled());
    await waitFor(() => expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(1));
    mockNative.cancelAllHabitReminders.mockRejectedValueOnce(new Error('cancel failed'));

    await act(async () => { await currentStore!.archiveQuest('habit-1'); });
    expect(currentStore?.reminderWarning).toMatch(/archived.*cancel failed/i);
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(2);

    await act(async () => { await currentStore!.retryReminders(); });
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(3);
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('does not re-arm an archived quest when an older save resumes after archive cleanup', async () => {
    await mountStore();
    await waitFor(() => expect(mockNative.scheduleHabitReminders).toHaveBeenCalled());
    mockNative.scheduleHabitReminders.mockClear();
    mockShared.archiveHabit.mockImplementation(async () => {
      mockShared.fetchAllActiveHabits.mockResolvedValue([]);
    });
    let releaseInvalidate!: () => void;
    jest.spyOn(activeClient!, 'invalidateQueries').mockImplementationOnce(() => new Promise(resolve => {
      releaseInvalidate = () => resolve(undefined);
    }) as any);
    let save!: Promise<void>;
    await act(async () => {
      save = currentStore!.saveHabit({
        name: 'Read', easyVersion: 'Read one page', stat: 'WIS', difficulty: 'Easy',
        time: '08:00', days: [1, 2, 3, 4, 5], questType: 'habit',
      }, 'habit-1');
      await Promise.resolve();
    });
    await waitFor(() => expect(releaseInvalidate).toBeDefined());
    await act(async () => { await currentStore!.archiveQuest('habit-1'); });
    await act(async () => { releaseInvalidate(); await save; });
    await waitFor(() => expect(mockShared.fetchAllActiveHabits).toHaveBeenCalledTimes(3));
    expect(mockNative.scheduleHabitReminders).not.toHaveBeenCalled();
  });

  it('requests permission after an explicit reminder opt-in', async () => {
    mockPreference.getNotificationsEnabled.mockResolvedValue(false);
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.cancelAllHabitReminders).toHaveBeenCalled());
    mockNative.requestNotificationPermissions.mockClear();

    await act(async () => { currentStore!.setNotificationsEnabled(true); });
    await waitFor(() => expect(mockNative.requestNotificationPermissions).toHaveBeenCalledTimes(1));
    expect(mockNative.ensureNotificationSetup.mock.invocationCallOrder.at(-1))
      .toBeLessThan(mockNative.requestNotificationPermissions.mock.invocationCallOrder[0]);
  });

  it('keeps a failed preference write visible without prompting or changing the toggle', async () => {
    mockPreference.getNotificationsEnabled.mockResolvedValue(false);
    mockPreference.setNotificationsEnabled.mockRejectedValueOnce(new Error('storage full'));
    await mountStore();
    await waitFor(() => expect(currentStore?.notificationsEnabled).toBe(false));

    await act(async () => { currentStore!.setNotificationsEnabled(true); });
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/preference could not be saved.*storage full/i));
    expect(currentStore?.notificationsEnabled).toBe(false);
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();

    await act(async () => { await currentStore!.retryReminders(); });
    expect(currentStore?.reminderWarning).toBeNull();
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it('keeps a failed preference read visible until Retry reads storage again', async () => {
    mockPreference.getNotificationsEnabled
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(false);
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/preference could not be read/i));
    expect(mockNative.inspectNotificationPermissions).not.toHaveBeenCalled();

    await act(async () => { await currentStore!.retryReminders(); });
    expect(currentStore?.notificationsEnabled).toBe(false);
    expect(currentStore?.reminderWarning).toBeNull();
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });
});

describe('offline quest recovery', () => {
  it('keeps the change and shows no raw transport error when a completion fails to send', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));
    mockCompleteHabit.mockRejectedValueOnce({ message: 'Network request failed', code: '', details: null, hint: null });

    await act(async () => { currentStore!.toggleQuest('habit-1'); });

    await waitFor(() => expect(currentStore?.syncEntries[0]?.status).toBe('uncertain'));
    expect(currentStore?.user.quests[0].completed).toBe(true);
    expect(currentStore?.syncStates.get('habit-1')).toBe('checking');
    expect(currentStore?.questsError).toBeNull();
  });

  it('keeps cached quests after an offline completion failure, then checks the server and resends once on reconnect', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));
    mockCompleteHabit.mockRejectedValueOnce(new TypeError('Network request failed'));

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.syncEntries[0]?.status).toBe('uncertain'));
    expect(currentStore?.questsHaveCachedData).toBe(true);
    expect(mockCompleteHabit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(mockNetwork.addNetworkStateListener).toHaveBeenCalled());
    expect(mockNetwork.listener).not.toBeNull();
    await act(async () => { await mockNetwork.listener?.({ isConnected: false }); });
    const readsBefore = mockShared.fetchTodayHabits.mock.calls.length;
    await act(async () => {
      await mockNetwork.listener?.({ isConnected: true });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(currentStore?.questsError).toBeNull();
  });
});

const backlogQuest: Quest = {
  id: 'backlog-1', name: 'Try Zig', stat: 'INT', difficulty: 'Easy', easyVersion: null, description: null,
  questType: 'backlog', archived: false, time: '00:00', days: [], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0, timeSet: false, genre: 'tool',
};

describe('Backlog and moving quests between lanes', () => {
  it('loads Backlog once the board read has succeeded and exposes it', async () => {
    mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
    await mountStore();
    await waitFor(() => expect(currentStore!.backlog).toEqual([backlogQuest]));
    expect(mockShared.fetchBacklogQuests).toHaveBeenCalledWith('user-1');
    const board = mockShared.fetchTodayHabits.mock.invocationCallOrder[0];
    const backlog = mockShared.fetchBacklogQuests.mock.invocationCallOrder[0];
    expect(backlog).toBeGreaterThan(board);
  });

  it('starts with an empty Backlog while it loads', async () => {
    mockShared.fetchBacklogQuests.mockReturnValue(new Promise(() => {}));
    await mountStore();
    await waitFor(() => expect(mockShared.fetchBacklogQuests).toHaveBeenCalled());
    expect(currentStore!.backlog).toEqual([]);
  });

  it('shows a failed Backlog read as a board error, not as an empty Backlog', async () => {
    mockShared.fetchBacklogQuests.mockRejectedValue(new Error('Backlog is unavailable'));
    await mountStore();
    await waitFor(() => expect(currentStore!.questsError).toContain('Backlog is unavailable'));
  });

  it('moves a Backlog quest to One-time, then refreshes both lists', async () => {
    mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
    await mountStore();
    await waitFor(() => expect(currentStore!.backlog).toHaveLength(1));
    const boardCalls = mockShared.fetchTodayHabits.mock.calls.length;
    const backlogCalls = mockShared.fetchBacklogQuests.mock.calls.length;
    await act(async () => { await currentStore!.moveToOneTime('backlog-1'); });
    expect(mockShared.moveBacklogToOneTime).toHaveBeenCalledWith('backlog-1');
    expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(boardCalls);
    expect(mockShared.fetchBacklogQuests.mock.calls.length).toBeGreaterThan(backlogCalls);
  });

  it('moves a One-time quest to Backlog, then refreshes both lists', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    const boardCalls = mockShared.fetchTodayHabits.mock.calls.length;
    await act(async () => { await currentStore!.moveToBacklog('habit-1'); });
    expect(mockShared.moveOneTimeToBacklog).toHaveBeenCalledWith('habit-1');
    expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(boardCalls);
  });

  it('reports why a move was refused, rethrows it, and refreshes nothing', async () => {
    mockShared.moveOneTimeToBacklog.mockRejectedValue(new Error('This quest already has a completion.'));
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    const boardCalls = mockShared.fetchTodayHabits.mock.calls.length;
    await act(async () => { await expect(currentStore!.moveToBacklog('habit-1')).rejects.toThrow('already has a completion'); });
    expect(currentStore!.questsError).toContain('already has a completion');
    expect(mockShared.fetchTodayHabits.mock.calls.length).toBe(boardCalls);
  });

  it('calls the server once when the same quest is moved twice at the same time', async () => {
    let finish!: () => void;
    mockShared.moveOneTimeToBacklog.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = currentStore!.moveToBacklog('habit-1'); second = currentStore!.moveToBacklog('habit-1'); });
    expect(mockShared.moveOneTimeToBacklog).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await Promise.all([first, second]); });
  });

  it('lets a different quest move while another is still in flight', async () => {
    let finish!: () => void;
    mockShared.moveOneTimeToBacklog.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    let slow!: Promise<void>;
    await act(async () => { slow = currentStore!.moveToBacklog('habit-1'); });
    await act(async () => { await currentStore!.moveToOneTime('backlog-1'); });
    expect(mockShared.moveBacklogToOneTime).toHaveBeenCalledWith('backlog-1');
    await act(async () => { finish(); await slow; });
  });

  it('drops a deleted quest from the Backlog list straight away', async () => {
    // Every read before the delete sees the quest (a second early read must not empty the list), every read after it does not.
    mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
    await mountStore();
    await waitFor(() => expect(currentStore!.backlog).toHaveLength(1));
    mockShared.fetchBacklogQuests.mockResolvedValue([]);
    await act(async () => { await currentStore!.deleteQuest('backlog-1'); });
    expect(mockShared.deleteHabit).toHaveBeenCalledWith('backlog-1');
    expect(currentStore!.backlog).toEqual([]);
  });

  it('refetches Backlog on Retry along with the rest of the board', async () => {
    mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
    await mountStore();
    await waitFor(() => expect(currentStore!.backlog).toHaveLength(1));
    const calls = mockShared.fetchBacklogQuests.mock.calls.length;
    await act(async () => { await currentStore!.retryQuests(); });
    expect(mockShared.fetchBacklogQuests.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe('invalidateForNewDay', () => {
  it('refreshes the board first and Backlog only after it, because the board read is what rolls unfinished one-time quests into Backlog', async () => {
    const qc = new QueryClient();
    const order: string[] = [];
    let releaseHabits!: () => void;
    jest.spyOn(qc, 'invalidateQueries').mockImplementation(((filters: { queryKey: readonly unknown[] }) => {
      const name = String(filters.queryKey[0]);
      order.push(`start:${name}`);
      if (name === 'habits') return new Promise<void>(resolve => { releaseHabits = () => { order.push('end:habits'); resolve(); }; });
      order.push(`end:${name}`);
      return Promise.resolve();
    }) as never);
    const done = invalidateForNewDay(qc, 'user-1');
    await Promise.resolve();
    expect(order).not.toContain('start:backlog');
    releaseHabits();
    await done;
    expect(order.indexOf('start:backlog')).toBeGreaterThan(order.indexOf('end:habits'));
    expect(order.some(entry => entry.includes('weeklyQuest'))).toBe(false); // the Weekly Quest is gone from mobile
  });
});
