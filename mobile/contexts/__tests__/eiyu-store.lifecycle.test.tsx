import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = {
  archiveHabit: jest.fn(),
  createHabit: jest.fn(),
  deleteHabit: jest.fn(),
  fetchAllActiveHabits: jest.fn(),
  fetchLongQuests: jest.fn(),
  fetchOrCreateWeeklyQuest: jest.fn(),
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

const mockNetwork = {
  getNetworkStateAsync: jest.fn(),
  addNetworkStateListener: jest.fn(),
  listener: null as ((state: { isConnected: boolean | null }) => void | Promise<unknown>) | null,
};
mockNetwork.addNetworkStateListener.mockImplementation((listener: typeof mockNetwork.listener) => {
  mockNetwork.listener = listener;
  return { remove: jest.fn() };
});
const mockCompleteHabit = jest.fn();

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  completeHabit: mockCompleteHabit,
}));
// The store is the subject here, not the theme: a stable stand-in for the provider that normally sits above it.
jest.doMock('@/contexts/theme-store', () => {
  const { darkTheme } = jest.requireActual('@/constants/eiyu-theme');
  const stub = { mode: 'dark', palette: 'cyan', darkMode: true, theme: darkTheme, setMode: () => {}, setPalette: () => {} };
  return { useAppTheme: () => stub };
});
jest.doMock('@/contexts/auth-store', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.doMock('@/lib/notifications', () => mockNative);
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => ({
  getSoundEffectsEnabled: jest.fn().mockResolvedValue(false),
  setSoundEffectsEnabled: jest.fn().mockResolvedValue(undefined),
}));
jest.doMock('expo-network', () => mockNetwork, { virtual: true });
jest.doMock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn(), volume: 1 }) }));

const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');

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

beforeEach(() => {
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
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchOrCreateWeeklyQuest.mockResolvedValue(null);
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
  mockNetwork.addNetworkStateListener.mockImplementation((listener: typeof mockNetwork.listener) => {
    mockNetwork.listener = listener;
    return { remove: jest.fn() };
  });
  mockNetwork.listener = null;
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
  it('formats Supabase plain-object transport errors as friendly offline feedback', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });
    mockCompleteHabit.mockRejectedValueOnce({ message: 'Network request failed', code: '', details: null, hint: null });

    await act(async () => {
      currentStore!.toggleQuest('habit-1');
      await Promise.resolve();
    });

    await waitFor(() => expect(currentStore?.questsError).toMatch(/offline.*wasn't saved.*saved quests are still shown/i));
    expect(currentStore?.user.quests[0].completed).toBe(false);
    expect(currentStore?.questsError).not.toContain('Network request failed');
  });

  it('keeps cached quests after an offline completion failure and refetches once on reconnect', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));
    expect(mockShared.fetchTodayHabits).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.resolve(); });
    mockCompleteHabit.mockRejectedValueOnce(new TypeError('Network request failed'));

    await act(async () => {
      currentStore!.toggleQuest('habit-1');
      await Promise.resolve();
    });
    await waitFor(() => expect(currentStore?.questsError).toMatch(/offline.*wasn't saved.*saved quests are still shown/i));
    expect(currentStore?.user.quests[0].completed).toBe(false);
    expect(currentStore?.questsHaveCachedData).toBe(true);
    expect(currentStore?.questsError).not.toContain('Network request failed');

    await waitFor(() => expect(mockNetwork.addNetworkStateListener).toHaveBeenCalled());
    expect(mockNetwork.listener).not.toBeNull();
    await act(async () => { mockNetwork.listener?.({ isConnected: false }); });
    await act(async () => {
      await mockNetwork.listener?.({ isConnected: true });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(mockShared.fetchTodayHabits).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(currentStore?.questsError).toBeNull());
    expect(currentStore?.user.quests[0].completed).toBe(false);

    expect(mockShared.fetchTodayHabits).toHaveBeenCalledTimes(2);
  });
});
