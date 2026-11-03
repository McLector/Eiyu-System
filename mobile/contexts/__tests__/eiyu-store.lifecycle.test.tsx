import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
import { Text } from 'react-native';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';
import { trackerAccess, basicTarget, CLASSIFIED, createTrackerMocks, resetTrackerMocks, revisionOf } from '@/test-support/tracker-fixtures';

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
  notificationPermissionNeverAsked: jest.fn(),
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

const mockTracker = createTrackerMocks();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  ...mockTracker,
  completeHabit: mockCompleteHabit,
}));
jest.doMock('@/contexts/auth-store', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
// The store filters reminder rows with the real, pure helper; native scheduling stays mocked.
jest.doMock('@/lib/notifications', () => ({ ...mockNative, filterReminderRows: jest.requireActual('@/lib/notifications').filterReminderRows }));
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
  streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, ...CLASSIFIED,
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
  resetTrackerMocks(mockTracker);
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
  mockNative.notificationPermissionNeverAsked.mockResolvedValue(false);
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

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
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

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/restored.*reminders/i));
  });

  it('does not inspect OS permission when reminders are disabled', async () => {
    mockPreference.getNotificationsEnabled.mockResolvedValue(false);
    await mountStore();
    await waitFor(() => expect(currentStore).not.toBeNull());
    await waitFor(() => expect(mockNative.cancelAllHabitReminders).toHaveBeenCalled());

    await act(async () => { await currentStore!.restoreQuest('habit-1'); });

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
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

    expect(mockShared.restoreHabit).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
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
    expect(mockShared.archiveHabit).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
    expect(mockNative.cancelAllHabitReminders).not.toHaveBeenCalled();

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
      save = currentStore!.saveHabit({ mode: 'custom', values: {
        name: 'Read', easyVersion: 'Read one page', stat: 'WIS', difficulty: 'Easy',
        time: '08:00', days: [1, 2, 3, 4, 5], questType: 'habit',
      } }, 'habit-1');
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
  it('retains a completion the server later holds as paused (under 12) in the review flow until explicit Retry', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));
    await waitFor(() => expect(currentStore?.tracker).toBeTruthy());
    // The loaded capability still allowed the tap; the fresh read made when the queue sends says the account is paused.
    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({ canWriteBasic: false }, 'user-1'));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.failedSyncs[0]?.failure?.reason).toBe('tracker-paused'));
    expect(currentStore?.user.quests[0].completed).toBe(false);
    expect(mockCompleteHabit).not.toHaveBeenCalled();
    resetTrackerMocks(mockTracker);
    await act(async () => { await mockNetwork.listener?.({ isConnected: true }); });
    expect(mockCompleteHabit).not.toHaveBeenCalled();
    const id = currentStore!.failedSyncs[0].id;
    let answer: boolean | undefined;
    await act(async () => { answer = await currentStore!.retrySync(id); });
    expect(answer).toBe(true);
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
  });

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
  targetCount: null, progressCount: 0, timeSet: false, genre: 'tool', ...CLASSIFIED,
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
    expect(mockShared.moveBacklogToOneTime).toHaveBeenCalledWith('backlog-1', revisionOf(), basicTarget('backlog-1'));
    expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(boardCalls);
    expect(mockShared.fetchBacklogQuests.mock.calls.length).toBeGreaterThan(backlogCalls);
  });

  it('moves a One-time quest to Backlog, then refreshes both lists', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    const boardCalls = mockShared.fetchTodayHabits.mock.calls.length;
    await act(async () => { await currentStore!.moveToBacklog('habit-1'); });
    expect(mockShared.moveOneTimeToBacklog).toHaveBeenCalledWith('habit-1', revisionOf(), basicTarget('habit-1'));
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
    mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
    await mountStore();
    await waitFor(() => expect(currentStore!.user.quests.length).toBeGreaterThan(0));
    await waitFor(() => expect(currentStore!.backlog).toHaveLength(1));
    let slow!: Promise<void>;
    await act(async () => { slow = currentStore!.moveToBacklog('habit-1'); });
    await act(async () => { await currentStore!.moveToOneTime('backlog-1'); });
    expect(mockShared.moveBacklogToOneTime).toHaveBeenCalledWith('backlog-1', revisionOf(), basicTarget('backlog-1'));
    await act(async () => { finish(); await slow; });
  });

  it('drops a deleted quest from the Backlog list straight away', async () => {
    // Every read before the delete sees the quest (a second early read must not empty the list), every read after it does not.
    // React Query hands state changes to React on a timer; a slow one stands in for a loaded machine.
    notifyManager.setScheduler(callback => { setTimeout(callback, 60); });
    try {
      mockShared.fetchBacklogQuests.mockResolvedValue([backlogQuest]);
      await mountStore();
      await waitFor(() => expect(currentStore!.backlog).toHaveLength(1));
      mockShared.fetchBacklogQuests.mockResolvedValue([]);
      await act(async () => { await currentStore!.deleteQuest('backlog-1'); });
      expect(mockShared.deleteHabit).toHaveBeenCalledWith('backlog-1', revisionOf(), basicTarget('backlog-1'));
      await waitFor(() => expect(currentStore!.backlog).toEqual([]));
    } finally {
      notifyManager.setScheduler(callback => { setTimeout(callback, 0); });
    }
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

describe('asking for notification permission', () => {
  const NEW_QUEST = { mode: 'custom' as const, values: {
    name: 'Read', easyVersion: 'Read one page', stat: 'WIS' as const, difficulty: 'Easy' as const, time: '08:00', days: [1, 2, 3, 4, 5], questType: 'habit' as const,
  } };
  const neverAsked = () => {
    mockNative.inspectNotificationPermissions.mockResolvedValue(false);
    mockNative.notificationPermissionNeverAsked.mockResolvedValue(true);
  };
  const refused = () => {
    mockNative.inspectNotificationPermissions.mockResolvedValue(false);
    mockNative.notificationPermissionNeverAsked.mockResolvedValue(false);
  };
  const synced = () => waitFor(() => expect(mockNative.inspectNotificationPermissions).toHaveBeenCalled());
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  it('says nothing to a new account with no quests, and does not prompt', async () => {
    neverAsked();
    mockShared.fetchAllActiveHabits.mockResolvedValue([]);
    await mountStore();
    await synced();
    await settle();
    expect(currentStore?.reminderWarning).toBeNull();
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it('does not prompt on launch when quests exist, and offers Retry to ask', async () => {
    neverAsked();
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/needs permission.*Retry/i));
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
    expect(mockNative.scheduleHabitReminders).not.toHaveBeenCalled();
  });

  it('asks when the person taps Retry, then schedules and clears the banner', async () => {
    neverAsked();
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/needs permission/i));
    await act(async () => { await currentStore!.retryReminders(); });
    expect(mockNative.requestNotificationPermissions).toHaveBeenCalledTimes(1);
    expect(mockNative.scheduleHabitReminders).toHaveBeenCalled();
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('points at phone settings when the person says no at the prompt', async () => {
    neverAsked();
    mockNative.requestNotificationPermissions.mockResolvedValue(false);
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/needs permission/i));
    await act(async () => { await currentStore!.retryReminders(); });
    expect(currentStore?.reminderWarning).toMatch(/permission.*phone settings/i);
    expect(mockNative.scheduleHabitReminders).not.toHaveBeenCalled();
  });

  it('asks when the first quest is saved, because that is what sets a reminder', async () => {
    neverAsked();
    mockShared.fetchAllActiveHabits.mockResolvedValue([]);
    await mountStore();
    await synced();
    await settle();
    mockShared.fetchAllActiveHabits.mockResolvedValue([{ id: 'habit-1', name: 'Read', time: '08:00', days: [1] }]);
    await act(async () => { await currentStore!.saveHabit(NEW_QUEST); });
    await waitFor(() => expect(mockNative.requestNotificationPermissions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNative.scheduleHabitReminders).toHaveBeenCalled());
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('does not ask again on save once the person has said no', async () => {
    refused();
    await mountStore();
    await synced();
    await act(async () => { await currentStore!.saveHabit(NEW_QUEST); });
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/quest saved, but.*permission/i));
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it('does not prompt when a quest is restored, even if never asked', async () => {
    neverAsked();
    await mountStore();
    await synced();
    await act(async () => { await currentStore!.restoreQuest('habit-1'); });
    await settle();
    expect(mockNative.requestNotificationPermissions).not.toHaveBeenCalled();
  });

  it('still says what to do when notifications were refused earlier', async () => {
    refused();
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/permission.*phone settings/i));
    expect(currentStore?.reminderWarning).not.toMatch(/Error/);
  });
});

describe('reminders with no connection', () => {
  const down = new TypeError('Network request failed');
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const offlineStart = async () => {
    mockShared.fetchAllActiveHabits.mockRejectedValue(down);
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await mountStore();
    await waitFor(() => expect(mockShared.fetchAllActiveHabits).toHaveBeenCalled());
    await settle();
  };

  it('keeps the reminders already on the phone', async () => {
    await offlineStart();
    expect(mockNative.cancelAllHabitReminders).not.toHaveBeenCalled();
  });

  it('shows no banner, because nothing is wrong that the person can act on', async () => {
    await offlineStart();
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('brings reminders up to date when the connection comes back', async () => {
    await offlineStart();
    mockShared.fetchAllActiveHabits.mockResolvedValue([{ id: 'habit-1', name: 'Read', time: '08:00', days: [1] }]);
    await act(async () => { await mockNetwork.listener?.({ isConnected: true }); });
    await waitFor(() => expect(mockNative.scheduleHabitReminders).toHaveBeenCalled());
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(1);
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('does not sync again on reconnect when nothing was skipped', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await mountStore();
    await waitFor(() => expect(mockNative.scheduleHabitReminders).toHaveBeenCalled());
    await settle();
    const fetches = mockShared.fetchAllActiveHabits.mock.calls.length;
    await act(async () => { await mockNetwork.listener?.({ isConnected: true }); });
    await settle();
    expect(mockShared.fetchAllActiveHabits).toHaveBeenCalledTimes(fetches);
  });

  it('stays quiet when a quest restored offline cannot refresh reminders', async () => {
    await offlineStart();
    await act(async () => { await currentStore!.restoreQuest('habit-1'); });
    await settle();
    expect(currentStore?.reminderWarning).toBeNull();
  });

  it('still clears and reports a failure that is not about the connection', async () => {
    mockShared.fetchAllActiveHabits.mockRejectedValue(new Error('server said no'));
    await mountStore();
    await waitFor(() => expect(currentStore?.reminderWarning).toMatch(/could not be updated.*server said no/i));
    expect(mockNative.cancelAllHabitReminders).toHaveBeenCalledTimes(1);
  });
});
