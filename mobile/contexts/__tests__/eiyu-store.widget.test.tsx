import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, configure, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
import { Platform, Text } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { TestThemeProvider } from '@/components/ui/test-theme';
import { decodeSnapshot, WIDGET_KEY, type ReadySnapshot } from '@/lib/widget-snapshot';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
let mockAuth: { session: { user: { id: string } } | null; loading: boolean } = { session: { user: { id: 'user-1' } }, loading: false };

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  completeHabit: mockCompleteHabit,
}));
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => mockAuth }));
jest.doMock('@/lib/notifications', () => mockNative);
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => mockSoundPreference);
installExpoNetworkMock(mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: jest.fn(() => mockAudioPlayer) }));

const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');

const DAY1 = new Date('2026-10-05T12:00:00Z');
const update = requestWidgetUpdate as jest.Mock;
let platform: { restore: () => void };

const quest: Quest = {
  id: 'habit-1', name: 'Read', stat: 'WIS', difficulty: 'Easy', easyVersion: 'Read one page',
  description: null, questType: 'habit', archived: false, time: '08:00', days: [1, 2, 3, 4, 5],
  streak: 0, frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0,
};
const water: Quest = { ...quest, id: 'water', name: 'Drink water', targetCount: 4, progressCount: 0 };

let currentStore: ReturnType<typeof useEiyu> | null = null;
let activeClient: QueryClient | null = null;

function Probe() {
  currentStore = useEiyu();
  return <Text>{currentStore.reminderWarning ?? ''}</Text>;
}

async function mountStore(theme: { palette?: 'cyan' | 'jade'; mode?: 'dark' | 'light' } = {}) {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(
    <QueryClientProvider client={activeClient}>
      <TestThemeProvider {...theme}>
        <EiyuProvider><Probe /></EiyuProvider>
      </TestThemeProvider>
    </QueryClientProvider>
  );
}

// The store alone, with no theme provider above it: the widget falls back to the shared default palette.
async function mountStoreWithoutTheme() {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return await render(
    <QueryClientProvider client={activeClient}>
      <EiyuProvider><Probe /></EiyuProvider>
    </QueryClientProvider>
  );
}

async function storedSnapshot() {
  return decodeSnapshot(await AsyncStorage.getItem(WIDGET_KEY));
}

async function storedReady(): Promise<ReadySnapshot> {
  const snapshot = await storedSnapshot();
  if (!snapshot || snapshot.state !== 'ready') throw new Error(`expected a ready snapshot, got ${JSON.stringify(snapshot)}`);
  return snapshot;
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: DAY1,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'],
  });
  platform = jest.replaceProperty(Platform, 'OS', 'android');
  await AsyncStorage.clear();
  jest.clearAllMocks();
  currentStore = null;
  mockAuth = { session: { user: { id: 'user-1' } }, loading: false };
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchTodayHabits.mockResolvedValue([quest, water]);
  mockShared.fetchTodayOneTimeHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  mockShared.incrementHabitProgress.mockResolvedValue(0);
  mockShared.undoCompletion.mockResolvedValue(undefined);
  mockCompleteHabit.mockResolvedValue(undefined);
  mockNative.cancelAllHabitReminders.mockResolvedValue(undefined);
  mockNative.ensureNotificationSetup.mockResolvedValue(undefined);
  mockNative.inspectNotificationPermissions.mockResolvedValue(true);
  mockNative.requestNotificationPermissions.mockResolvedValue(true);
  mockNative.scheduleHabitReminders.mockResolvedValue(undefined);
  mockNative.scheduleOneTimeReminder.mockResolvedValue(undefined);
  mockPreference.getNotificationsEnabled.mockResolvedValue(false);
  mockPreference.setNotificationsEnabled.mockResolvedValue(undefined);
  mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(false);
  mockSoundPreference.setSoundEffectsEnabled.mockResolvedValue(undefined);
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  mockNetwork.addNetworkStateListener.mockImplementation(() => ({ remove: jest.fn() }));
  mockAudioPlayer.seekTo.mockResolvedValue(undefined);
  update.mockImplementation(async () => undefined);
});

afterEach(() => {
  cleanup();
  activeClient?.clear();
  activeClient = null;
  platform.restore();
  jest.useRealTimers();
});

describe('the store keeps the widget snapshot current', () => {
  it('stores today\'s board once it has loaded, dated by when it was fetched, and asks the widget to redraw', async () => {
    await mountStore();
    await waitFor(async () => expect((await storedSnapshot())?.state).toBe('ready'));
    const snapshot = await storedReady();
    expect(snapshot).toMatchObject({ accountDate: '2026-10-05', timeZone: 'UTC', completed: 0, total: 2, waiting: 0, palette: 'cyan', mode: 'dark' });
    expect(snapshot.rows.map(row => row.name).sort()).toEqual(['Drink water', 'Read']);
    expect(update).toHaveBeenCalled();
  });

  it('falls back to System blue in the dark when no theme provider is mounted', async () => {
    await mountStoreWithoutTheme();
    await waitFor(async () => expect((await storedSnapshot())?.state).toBe('ready'));
    expect(await storedReady()).toMatchObject({ palette: 'blue', mode: 'dark' });
  });

  it('uses the saved palette and mode', async () => {
    await mountStore({ palette: 'jade', mode: 'light' });
    await waitFor(async () => expect((await storedSnapshot())?.state).toBe('ready'));
    expect(await storedReady()).toMatchObject({ palette: 'jade', mode: 'light' });
  });

  it('shows a completion made offline as done and waiting to sync, never as plainly done', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    await mountStore();
    await waitFor(() => expect(currentStore?.syncOffline).toBe(true));
    await waitFor(() => expect(currentStore?.user.quests.length).toBeGreaterThan(0));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(async () => expect((await storedReady()).waiting).toBe(1));
    const snapshot = await storedReady();
    expect(snapshot.rows.find(row => row.name === 'Read')).toMatchObject({ done: true, tag: 'pending' });
    expect(snapshot.completed).toBe(1);
    expect(mockCompleteHabit).not.toHaveBeenCalled();
  });

  it('counts an offline progress change once, not twice', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    await mountStore();
    await waitFor(() => expect(currentStore?.syncOffline).toBe(true));
    await waitFor(() => expect(currentStore?.user.quests.length).toBeGreaterThan(0));
    await act(async () => { currentStore!.adjustProgress('water', 1); });
    await waitFor(async () => expect((await storedReady()).waiting).toBe(1));
    const row = (await storedReady()).rows.find(item => item.name === 'Drink water');
    expect(row).toMatchObject({ progress: { count: 1, target: 4 }, done: false, tag: 'pending' });
  });

  it('drops the tag once the server has confirmed the write', async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: false });
    await mountStore();
    await waitFor(() => expect(currentStore?.syncOffline).toBe(true));
    await waitFor(() => expect(currentStore?.user.quests.length).toBeGreaterThan(0));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(async () => expect((await storedReady()).waiting).toBe(1));

    mockShared.fetchTodayHabits.mockResolvedValue([{ ...quest, completed: true }, water]);
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
    const handlers = mockNetwork.addNetworkStateListener.mock.calls.map(call => call[0] as (state: { isConnected?: boolean }) => void);
    await act(async () => { handlers.forEach(handler => handler({ isConnected: true })); });
    await waitFor(async () => expect((await storedReady()).waiting).toBe(0));
    const snapshot = await storedReady();
    expect(snapshot.rows.find(row => row.name === 'Read')).toMatchObject({ done: true });
    expect(snapshot.rows.find(row => row.name === 'Read')?.tag).toBeUndefined();
  });

  it('writes nothing until the profile has told us the account zone', async () => {
    mockShared.fetchProfile.mockImplementation(() => new Promise(() => {}));
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests.length).toBeGreaterThan(0));
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing before the board has loaded', async () => {
    mockShared.fetchTodayHabits.mockImplementation(() => new Promise(() => {}));
    await mountStore();
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBeNull();
  });

  it('writes a signed-out snapshot, with no quests, when nobody is signed in', async () => {
    mockAuth = { session: null, loading: false };
    await mountStore();
    await waitFor(async () => expect((await storedSnapshot())?.state).toBe('signed-out'));
    expect(await AsyncStorage.getItem(WIDGET_KEY)).not.toContain('Read');
  });

  it('writes nothing while auth is still loading', async () => {
    mockAuth = { session: null, loading: true };
    await mountStore();
    await settle();
    expect(await AsyncStorage.getItem(WIDGET_KEY)).toBeNull();
  });
});
