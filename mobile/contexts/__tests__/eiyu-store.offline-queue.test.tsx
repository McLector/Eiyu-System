import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, configure, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
import { Text } from 'react-native';

import { encodeQueue, type QueueEntry } from '@/lib/write-queue';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';
import { trackerWriteMarkerKey } from '@/lib/tracker-write-marker';
import { basicTarget, CLASSIFIED, createTrackerMocks, resetTrackerMocks, revisionOf, trackerAccess } from '@/test-support/tracker-fixtures';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Each step here crosses several async hops (storage, engine, query refetch); a full parallel run is slower than one suite alone.
configure({ asyncUtilTimeout: 5000 });

const mockShared = {
  archiveHabit: jest.fn(),
  completeHabitRecovery: jest.fn(),
  createHabit: jest.fn(),
  deleteHabit: jest.fn(),
  fetchAllActiveHabits: jest.fn(),
  fetchBacklogQuests: jest.fn(),
  fetchLongQuests: jest.fn(),
  fetchProfile: jest.fn(),
  fetchStats: jest.fn(),
  fetchAccountAge: jest.fn(),
  fetchTodayHabits: jest.fn(),
  fetchTodayOneTimeHabits: jest.fn(),
  fetchUpcomingOneTimeHabits: jest.fn(),
  incrementHabitProgress: jest.fn(),
  restoreHabit: jest.fn(),
  undoCompletion: jest.fn(),
  updateHabit: jest.fn(),
};
const mockCompleteHabit = jest.fn();
const mockNative = {
  cancelAllHabitReminders: jest.fn(),
  ensureNotificationSetup: jest.fn(),
  inspectNotificationPermissions: jest.fn(),
  notifyRecoveryQuestGenerated: jest.fn(),
  requestNotificationPermissions: jest.fn(),
  scheduleHabitReminders: jest.fn(),
  scheduleOneTimeReminder: jest.fn(),
};
const mockPreference = { getNotificationsEnabled: jest.fn(), setNotificationsEnabled: jest.fn() };
const mockSoundPreference = { getSoundEffectsEnabled: jest.fn(), setSoundEffectsEnabled: jest.fn() };
const mockAudioPlayer = { seekTo: jest.fn(), play: jest.fn(), volume: 1 };
const mockNetwork = { getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() };

const mockTracker = createTrackerMocks();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  ...mockTracker,
  completeHabit: mockCompleteHabit,
}));
const mockAuth: { session: { user: { id: string } } | null } = { session: { user: { id: 'user-1' } } };
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: mockAuth.session }) }));
// The store filters reminder rows with the real, pure helper; native scheduling stays mocked.
jest.doMock('@/lib/notifications', () => ({ ...mockNative, filterReminderRows: jest.requireActual('@/lib/notifications').filterReminderRows }));
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => mockSoundPreference);
installExpoNetworkMock(mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: jest.fn(() => mockAudioPlayer) }));

const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');

const DAY1 = new Date('2026-10-05T12:00:00Z');
const DAY2 = new Date('2026-10-06T12:00:00Z');
const TODAY = '2026-10-05';
const KEY = 'eiyu.writeQueue.v1.user-1';

const quest: Quest = {
  id: 'habit-1', name: 'Read', stat: 'WIS', difficulty: 'Easy', easyVersion: 'Read one page',
  description: null, questType: 'habit', archived: false, time: '08:00', days: [1, 2, 3, 4, 5],
  streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, ...CLASSIFIED,
};
const water: Quest = { ...quest, id: 'water', name: 'Drink water', targetCount: 4, progressCount: 0 };

let currentStore: ReturnType<typeof useEiyu> | null = null;
let activeClient: QueryClient | null = null;
let networkHandlers: ((state: { isConnected?: boolean }) => void)[] = [];

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

const quests = () => currentStore!.user.quests;
const byId = (id: string) => quests().find(item => item.id === id);
async function goOnline() {
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  await act(async () => { networkHandlers.forEach(handler => handler({ isConnected: true })); });
}
async function startOffline() {
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
  await mountStore();
  await waitFor(() => expect(currentStore?.syncOffline).toBe(true));
  await waitFor(() => expect(quests().length).toBeGreaterThan(0));
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const storedEntry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: 'old-1', userId: 'user-1', kind: 'complete', habitId: 'habit-1', accountDate: TODAY,
  createdAt: 1, attempts: 0, status: 'pending',
  // What the previous session captured when the write was made; without it the queue holds the write for review.
  trackerRevision: revisionOf(), trackerTargets: basicTarget(overrides.habitId ?? 'habit-1'),
  ...overrides,
});

beforeEach(async () => {
  jest.clearAllMocks();
  resetTrackerMocks(mockTracker);
  mockAuth.session = { user: { id: 'user-1' } };
  jest.useFakeTimers({
    now: DAY1,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'],
  });
  await AsyncStorage.clear();
  currentStore = null;
  networkHandlers = [];
  mockShared.archiveHabit.mockResolvedValue(undefined);
  mockShared.completeHabitRecovery.mockResolvedValue('recovered');
  mockShared.createHabit.mockResolvedValue('habit-1');
  mockShared.deleteHabit.mockResolvedValue(undefined);
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchAccountAge.mockResolvedValue({ userId: 'user-1', trackerWritesPaused: false });
  mockShared.fetchTodayHabits.mockResolvedValue([quest, water]);
  mockShared.fetchTodayOneTimeHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  mockShared.incrementHabitProgress.mockResolvedValue(0);
  mockShared.restoreHabit.mockResolvedValue(undefined);
  mockShared.undoCompletion.mockResolvedValue(undefined);
  mockShared.updateHabit.mockResolvedValue(undefined);
  mockCompleteHabit.mockResolvedValue(undefined);
  mockNative.cancelAllHabitReminders.mockResolvedValue(undefined);
  mockNative.ensureNotificationSetup.mockResolvedValue(undefined);
  mockNative.inspectNotificationPermissions.mockResolvedValue(true);
  mockNative.notifyRecoveryQuestGenerated.mockResolvedValue(undefined);
  mockNative.requestNotificationPermissions.mockResolvedValue(true);
  mockNative.scheduleHabitReminders.mockResolvedValue(undefined);
  mockNative.scheduleOneTimeReminder.mockResolvedValue(undefined);
  mockPreference.getNotificationsEnabled.mockResolvedValue(false);
  mockPreference.setNotificationsEnabled.mockResolvedValue(undefined);
  mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(false);
  mockSoundPreference.setSoundEffectsEnabled.mockResolvedValue(undefined);
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  mockNetwork.addNetworkStateListener.mockImplementation((handler: (state: { isConnected?: boolean }) => void) => {
    networkHandlers.push(handler);
    return { remove: jest.fn() };
  });
  mockAudioPlayer.seekTo.mockResolvedValue(undefined);
  mockAudioPlayer.play.mockClear();
});

afterEach(() => {
  cleanup();
  activeClient?.clear();
  activeClient = null;
  jest.useRealTimers();
});

describe('online writes go through the queue', () => {
  it('shows the completion at once, sends it with the date it was made on, and plays the sound only after the server confirms', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    let confirm: () => void = () => {};
    mockCompleteHabit.mockImplementation(() => new Promise<void>(resolve => { confirm = resolve; }));
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(quests()).toHaveLength(2));

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledWith('user-1', 'habit-1', 'WIS', 'full', revisionOf(), basicTarget('habit-1'), TODAY, 'UTC'));
    expect(byId('habit-1')?.completed).toBe(true);
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();

    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, completed: true }, water]);
    await act(async () => { confirm(); });
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(byId('habit-1')?.completed).toBe(true);
  });

  it('does not tag or announce a write that is simply being sent while online', async () => {
    let confirm: () => void = () => {};
    mockCompleteHabit.mockImplementation(() => new Promise<void>(resolve => { confirm = resolve; }));
    await mountStore();
    await waitFor(() => expect(quests()).toHaveLength(2));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalled());
    expect(currentStore?.syncStates.size).toBe(0);
    expect(currentStore?.syncWaiting).toBe(0);
    await act(async () => { confirm(); });
  });

  it('undoes with the date the write was made on and never plays a sound for an undo', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, completed: true }, water]);
    await mountStore();
    await waitFor(() => expect(byId('habit-1')?.completed).toBe(true));
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    mockShared.fetchTodayHabits.mockResolvedValue([quest, water]);
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockShared.undoCompletion).toHaveBeenCalledWith('user-1', 'habit-1', 'WIS', revisionOf(), basicTarget('habit-1'), 'UTC', TODAY));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();
  });

  it('shows a refused write as Not saved, puts the row back to server truth and surfaces the reason', async () => {
    mockCompleteHabit.mockRejectedValue({ message: 'habit habit-1 is not eligible on 2026-10-05' });
    await mountStore();
    await waitFor(() => expect(quests()).toHaveLength(2));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0]).toEqual(expect.objectContaining({ label: 'Read', failure: expect.objectContaining({ reason: 'not-on-board' }) }));
    expect(byId('habit-1')?.completed).toBe(false);
    expect(currentStore?.failedSyncs[0].failure?.message).toMatch(/no longer on today/);
    // The Board's not-saved notice carries this; the read-retry banner would only mislead.
    expect(currentStore?.questsError).toBeNull();
  });

  it('dismissing a failed write removes it and refreshes the board', async () => {
    mockCompleteHabit.mockRejectedValue({ message: 'habit habit-1 is not eligible on 2026-10-05' });
    await mountStore();
    await waitFor(() => expect(quests()).toHaveLength(2));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    const fetches = mockShared.fetchTodayHabits.mock.calls.length;
    await act(async () => { currentStore!.dismissSync(currentStore!.failedSyncs[0].id); });
    expect(currentStore?.failedSyncs).toEqual([]);
    await waitFor(() => expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(fetches));
  });
});

describe('writes made offline', () => {
  it('shows the change, holds it, and sends it when the connection returns', async () => {
    await startOffline();
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    expect(byId('habit-1')?.completed).toBe(true);
    expect(mockCompleteHabit).not.toHaveBeenCalled();
    expect(currentStore?.syncStates.get('habit-1')).toBe('pending');
    expect(currentStore?.syncWaiting).toBe(1);
    expect(currentStore?.questsError).toBeNull();

    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, completed: true }, water]);
    await goOnline();
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(byId('habit-1')?.completed).toBe(true);
  });

  it('decides complete or undo from what the user sees, so two offline taps cancel out', async () => {
    await startOffline();
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    expect(byId('habit-1')?.completed).toBe(false);
    expect(currentStore?.syncEntries).toEqual([]);
    await goOnline();
    await tick();
    expect(mockCompleteHabit).not.toHaveBeenCalled();
    expect(mockShared.undoCompletion).not.toHaveBeenCalled();
  });

  it('merges progress taps into one request whose base is the count the user saw', async () => {
    mockShared.incrementHabitProgress.mockResolvedValue(2);
    await startOffline();
    await act(async () => { currentStore!.adjustProgress('water', 1); });
    await act(async () => { currentStore!.adjustProgress('water', 1); });
    expect(byId('water')?.progressCount).toBe(2);
    expect(currentStore?.syncEntries).toEqual([expect.objectContaining({ kind: 'progress', delta: 2, base: 0 })]);
    mockShared.fetchTodayHabits.mockResolvedValue([quest, { ...water, progressCount: 2 }]);
    await goOnline();
    await waitFor(() => expect(mockShared.incrementHabitProgress).toHaveBeenCalledTimes(1));
    expect(mockShared.incrementHabitProgress).toHaveBeenCalledWith('water', TODAY, 2, revisionOf(), basicTarget('water'));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(byId('water')?.progressCount).toBe(2);
  });

  it('ignores a progress tap that would not change the count', async () => {
    await startOffline();
    await act(async () => { currentStore!.adjustProgress('water', -1); });
    expect(currentStore?.syncEntries).toEqual([]);
  });

  it('plays the sound for a progress write that crosses the target once the server confirms it', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockShared.fetchTodayHabits.mockResolvedValue([quest, { ...water, progressCount: 3 }]);
    mockShared.incrementHabitProgress.mockResolvedValue(4);
    await startOffline();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await act(async () => { currentStore!.adjustProgress('water', 1); });
    expect(byId('water')?.completed).toBe(true);
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();
    await goOnline();
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1));
  });

  it('queues a recovery, thaws the row, refuses a second tap, and sends it once on reconnect', async () => {
    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, frozen: true }]);
    await startOffline();
    await act(async () => { await currentStore!.completeRecovery('habit-1'); });
    expect(byId('habit-1')?.frozen).toBe(false);
    await act(async () => { await currentStore!.completeRecovery('habit-1'); });
    expect(currentStore?.syncEntries).toHaveLength(1);
    await goOnline();
    await waitFor(() => expect(mockShared.completeHabitRecovery).toHaveBeenCalledTimes(1));
  });

  it('does not announce a recovery as newly frozen when its queued write is refused', async () => {
    mockPreference.getNotificationsEnabled.mockResolvedValue(true);
    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, frozen: true }]);
    mockShared.completeHabitRecovery.mockRejectedValue(new Error('Recovery window has expired'));
    await startOffline();
    await waitFor(() => expect(currentStore?.notificationsEnabled).toBe(true));
    await act(async () => { await currentStore!.completeRecovery('habit-1'); });
    await goOnline();
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0].failure?.reason).toBe('recovery-closed');
    expect(byId('habit-1')?.frozen).toBe(true);
    expect(mockNative.notifyRecoveryQuestGenerated).not.toHaveBeenCalled();
  });

  it('keeps the unsent change visible when the board is refetched in the meantime', async () => {
    await startOffline();
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await act(async () => { await activeClient!.invalidateQueries({ queryKey: ['habits'] }); });
    expect(byId('habit-1')?.completed).toBe(true);
  });

  it('expires a write whose account day ended while the device was offline instead of sending it', async () => {
    await startOffline();
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    jest.setSystemTime(DAY2);
    mockShared.fetchTodayHabits.mockResolvedValue([quest, water]);
    await goOnline();
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0].failure?.reason).toBe('day-passed');
    expect(mockCompleteHabit).not.toHaveBeenCalled();
    expect(byId('habit-1')?.completed).toBe(false);
  });

  it('retries a failed write from the review list', async () => {
    mockCompleteHabit.mockRejectedValueOnce({ message: 'upstream exploded' });
    await mountStore();
    await waitFor(() => expect(quests()).toHaveLength(2));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    await act(async () => { currentStore!.retrySync(currentStore!.failedSyncs[0].id); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
  });
});

describe('across app launches', () => {
  it('sends a write left from the previous session once the app is online again', async () => {
    await AsyncStorage.setItem(KEY, encodeQueue([storedEntry()]));
    await mountStore();
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    // The server resolves the stat itself, and the board may not have loaded yet on a cold start.
    expect(mockCompleteHabit).toHaveBeenCalledWith('user-1', 'habit-1', expect.any(String), 'full', revisionOf(), basicTarget('habit-1'), TODAY, 'UTC');
  });

  it('waits for the account zone before judging or sending, so a write made on the account day is not mistaken for an old one', async () => {
    // Auckland is already on 2026-10-06 while UTC and most device zones still say 2026-10-05.
    mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'Pacific/Auckland' });
    await AsyncStorage.setItem(KEY, encodeQueue([storedEntry({ accountDate: '2026-10-06' })]));
    await mountStore();
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    expect(mockCompleteHabit).toHaveBeenCalledWith('user-1', 'habit-1', expect.any(String), 'full', revisionOf(), basicTarget('habit-1'), '2026-10-06', 'Pacific/Auckland');
    expect(currentStore?.failedSyncs).toEqual([]);
  });

  it('resolves a write caught mid-send by asking the server first, so progress is not counted twice', async () => {
    await AsyncStorage.setItem(KEY, encodeQueue([storedEntry({ kind: 'progress', habitId: 'water', delta: 2, base: 0, status: 'sending', attempts: 1 })]));
    mockShared.fetchTodayHabits.mockResolvedValue([quest, { ...water, progressCount: 2 }]);
    await mountStore();
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
    expect(mockShared.incrementHabitProgress).not.toHaveBeenCalled();
  });

  it('shows a write from a previous day as Not saved and never sends it', async () => {
    await AsyncStorage.setItem(KEY, encodeQueue([storedEntry({ accountDate: '2026-10-04' })]));
    await mountStore();
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(mockCompleteHabit).not.toHaveBeenCalled();
  });
});

describe('offline at a cold start, before any live access read', () => {
  const custom: Quest = { ...quest, inputKind: 'custom', canWrite: true };
  const customTarget = [{ kind: 'habit', id: 'habit-1', inputKind: 'custom' }];
  const liveCustomTargets = async (kind: string, ids: string[]) => ids.map(id => ({ kind, id, inputKind: 'custom', canWrite: true }));
  const saveMarker = (over: Record<string, unknown> = {}) => AsyncStorage.setItem(trackerWriteMarkerKey('user-1'), JSON.stringify({
    userId: 'user-1', revision: revisionOf(), canWriteBasic: true, canWriteCustom: true, savedAt: DAY1.getTime() - 60_000, ...over,
  }));
  async function coldStart(habits: Quest[] = [custom]) {
    mockTracker.fetchTrackerAccess.mockRejectedValue(new TypeError('Network request failed'));
    mockShared.fetchTodayHabits.mockResolvedValue(habits);
    await startOffline();
    await act(async () => { await tick(); });
  }
  const tap = () => act(async () => { currentStore!.toggleQuest('habit-1'); });
  function expectRefused() {
    expect(currentStore?.syncEntries).toEqual([]);
    expect(byId('habit-1')?.completed).toBe(false);
  }

  it('queues a tap on an ordinary custom quest, and sends it only after the live check passes', async () => {
    await saveMarker();
    await coldStart();
    await tap();
    expect(byId('habit-1')?.completed).toBe(true);
    expect(currentStore?.syncEntries).toEqual([expect.objectContaining({ kind: 'complete', trackerRevision: revisionOf(), trackerTargets: customTarget })]);
    expect(mockCompleteHabit).not.toHaveBeenCalled();

    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({}, 'user-1'));
    mockTracker.fetchTrackerTargets.mockImplementation(liveCustomTargets);
    mockShared.fetchTodayHabits.mockResolvedValue([{ ...custom, completed: true }]);
    await goOnline();
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledWith('user-1', 'habit-1', 'WIS', 'full', revisionOf(), customTarget, TODAY, 'UTC'));
    await waitFor(() => expect(currentStore?.syncEntries).toEqual([]));
  });
  it('queues a tap on a basic quest', async () => {
    await saveMarker({ canWriteCustom: false });
    await coldStart([quest]);
    await tap();
    expect(currentStore?.syncEntries).toEqual([expect.objectContaining({ kind: 'complete', trackerTargets: basicTarget('habit-1') })]);
  });
  it('queues offline progress the same way', async () => {
    await saveMarker();
    await coldStart([water]);
    await act(async () => { currentStore!.adjustProgress('water', 1); });
    expect(currentStore?.syncEntries).toEqual([expect.objectContaining({ kind: 'progress', delta: 1 })]);
  });

  it('holds the tap when custom permission was withdrawn elsewhere, and never sends it', async () => {
    await saveMarker();
    await coldStart();
    await tap();
    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({ customConsent: false, canWriteCustom: false }, 'user-1'));
    mockTracker.fetchTrackerTargets.mockImplementation(async (kind: string, ids: string[]) => ids.map(id => ({ kind, id, inputKind: 'custom', canWrite: false })));
    await goOnline();
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0]).toEqual(expect.objectContaining({ heldForProcessingPause: true }));
    expect(mockCompleteHabit).not.toHaveBeenCalled();
  });
  it('holds the tap when the account was paused in the meantime, and never sends it', async () => {
    await saveMarker();
    await coldStart();
    await tap();
    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'user-1'));
    await goOnline();
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0]).toEqual(expect.objectContaining({ heldForTrackerPause: true }));
    expect(mockCompleteHabit).not.toHaveBeenCalled();
  });
  it('holds the tap when the server refuses the revision it was made under', async () => {
    await saveMarker();
    await coldStart();
    await tap();
    const moved = { ...revisionOf(), consentVersion: revisionOf().consentVersion + 1 };
    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({ revision: moved }, 'user-1'));
    mockTracker.fetchTrackerTargets.mockImplementation(liveCustomTargets);
    mockCompleteHabit.mockRejectedValue({ code: 'ET003', message: 'Tracker access changed.' });
    await goOnline();
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledWith('user-1', 'habit-1', 'WIS', 'full', revisionOf(), customTarget, TODAY, 'UTC'));
    await waitFor(() => expect(currentStore?.failedSyncs).toHaveLength(1));
    expect(currentStore?.failedSyncs[0]).toEqual(expect.objectContaining({ heldForProcessingPause: true }));
  });

  it('refuses a tap when no marker is stored', async () => {
    await coldStart();
    await tap();
    expectRefused();
  });
  it('refuses a custom quest when the marker has no custom grant', async () => {
    await saveMarker({ canWriteCustom: false });
    await coldStart();
    await tap();
    expectRefused();
  });
  it('refuses a tap when the last read showed a paused account', async () => {
    await saveMarker({ canWriteBasic: false, canWriteCustom: false });
    await coldStart();
    await tap();
    expectRefused();
  });
  it('refuses a tap when the marker is too old', async () => {
    await saveMarker({ savedAt: DAY1.getTime() - 7 * 24 * 60 * 60 * 1000 });
    await coldStart();
    await tap();
    expectRefused();
  });
  it('refuses a tap when the marker belongs to another account', async () => {
    await saveMarker({ userId: 'user-2', revision: revisionOf('user-2') });
    await coldStart();
    await tap();
    expectRefused();
  });
  it('refuses a quest whose kind or writability is unknown', async () => {
    await saveMarker();
    await coldStart([{ ...quest, inputKind: undefined, canWrite: undefined }]);
    await tap();
    expectRefused();
  });
  it('never lets a marker unlock a write that goes straight to the server', async () => {
    await saveMarker();
    await coldStart();
    await expect(currentStore!.reorderQuests('habit', ['habit-1'])).rejects.toThrow();
    expect(currentStore?.syncEntries).toEqual([]);
  });
});

describe('keeping the stored marker current', () => {
  const stored = async () => JSON.parse((await AsyncStorage.getItem(trackerWriteMarkerKey('user-1'))) ?? 'null');

  it('saves the projection after a live read, without consent details', async () => {
    await mountStore();
    await waitFor(async () => expect(await stored()).toEqual({
      userId: 'user-1', revision: revisionOf(), canWriteBasic: true, canWriteCustom: true, savedAt: DAY1.getTime(),
    }));
  });
  it('replaces an earlier grant when a live read shows a pause', async () => {
    await AsyncStorage.setItem(trackerWriteMarkerKey('user-1'), JSON.stringify({
      userId: 'user-1', revision: revisionOf(), canWriteBasic: true, canWriteCustom: true, savedAt: DAY1.getTime() - 1,
    }));
    mockTracker.fetchTrackerAccess.mockImplementation(async () => trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'user-1'));
    await mountStore();
    await waitFor(async () => expect(await stored()).toEqual(expect.objectContaining({ canWriteBasic: false, canWriteCustom: false })));
  });
  it('leaves the marker alone when the live read fails', async () => {
    await AsyncStorage.setItem(trackerWriteMarkerKey('user-1'), JSON.stringify({
      userId: 'user-1', revision: revisionOf(), canWriteBasic: true, canWriteCustom: true, savedAt: DAY1.getTime() - 1,
    }));
    mockTracker.fetchTrackerAccess.mockRejectedValue(new TypeError('Network request failed'));
    await mountStore();
    await waitFor(() => expect(quests().length).toBeGreaterThan(0));
    await act(async () => { await tick(); });
    expect(await stored()).toEqual(expect.objectContaining({ savedAt: DAY1.getTime() - 1 }));
  });
  it('removes the marker on sign-out', async () => {
    const view = await mountStore();
    await waitFor(async () => expect(await stored()).not.toBeNull());
    mockAuth.session = null;
    await act(async () => {
      view.rerender(
        <QueryClientProvider client={activeClient!}>
          <EiyuProvider><Probe /></EiyuProvider>
        </QueryClientProvider>
      );
    });
    await waitFor(async () => expect(await stored()).toBeNull());
  });
});
