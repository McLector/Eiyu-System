import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type Quest } from '@eiyu/shared';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  ...mockShared,
  completeHabit: mockCompleteHabit,
}));
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.doMock('@/lib/notifications', () => mockNative);
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => mockSoundPreference);
jest.doMock('expo-network', () => mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: jest.fn(() => mockAudioPlayer) }));

const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');
const quest: Quest = {
  id: 'habit-1', name: 'Read', stat: 'WIS', difficulty: 'Easy', easyVersion: 'Read one page',
  description: null, questType: 'habit', archived: false, time: '08:00', days: [1, 2, 3, 4, 5],
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
  mockShared.createHabit.mockResolvedValue('habit-1');
  mockShared.deleteHabit.mockResolvedValue(undefined);
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchTodayHabits.mockResolvedValue([quest]);
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
  mockNetwork.addNetworkStateListener.mockReturnValue({ remove: jest.fn() });
  mockAudioPlayer.seekTo.mockResolvedValue(undefined);
  mockAudioPlayer.play.mockClear();
});

afterEach(() => {
  cleanup();
  activeClient?.clear();
  activeClient = null;
});

describe('completion sound effects', () => {
  it('defaults off, persists opt-in, and plays after a successful completion', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    expect(currentStore?.soundEffectsEnabled).toBe(false);

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();
    await waitFor(() => expect(currentStore?.user.quests[0].completed).toBe(false));

    await act(async () => { await currentStore!.setSoundEffectsEnabled(true); });
    expect(mockSoundPreference.setSoundEffectsEnabled).toHaveBeenCalledWith(true);
    expect(currentStore?.soundEffectsEnabled).toBe(true);

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(currentStore?.user.quests[0].completed).toBe(false));
    await act(async () => { await currentStore!.setSoundEffectsEnabled(false); });
    expect(mockSoundPreference.setSoundEffectsEnabled).toHaveBeenLastCalledWith(false);
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(3));
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockAudioPlayer.seekTo).toHaveBeenCalledWith(0);
  });

  it('has no long-press shortcut that completes a quest by its penalty', async () => {
    await mountStore();
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    expect(currentStore).not.toHaveProperty('completeEasy');
  });

  it('does not play on a refused completion, an undo, or partial quantity progress', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockCompleteHabit.mockRejectedValueOnce({ message: 'habit habit-1 is not eligible on today' });
    mockShared.fetchTodayHabits.mockResolvedValue([
      quest,
      { ...quest, id: 'quantity', name: 'Drink water', targetCount: 2, progressCount: 0 },
    ]);
    mockShared.incrementHabitProgress.mockResolvedValue(1);
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(currentStore?.questsError).toMatch(/no longer on today/));
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();

    // Once the write lands, the server reports the new count.
    mockShared.fetchTodayHabits.mockResolvedValue([
      quest,
      { ...quest, id: 'quantity', name: 'Drink water', targetCount: 2, progressCount: 1 },
    ]);
    await act(async () => { currentStore!.adjustProgress('quantity', 1); });
    await waitFor(() => expect(currentStore?.user.quests.find(item => item.id === 'quantity')?.progressCount).toBe(1));
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();

    await act(async () => {
      activeClient!.setQueryData(['habits', 'today', 'user-1'], [
        { ...quest, completed: true },
        { ...quest, id: 'quantity', name: 'Drink water', targetCount: 2, progressCount: 2 },
      ]);
    });
    await waitFor(() => expect(currentStore?.user.quests[0].completed).toBe(true));
    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockShared.undoCompletion).toHaveBeenCalled());
    expect(mockAudioPlayer.play).not.toHaveBeenCalled();
  });

  it('plays on a confirmed quantity target crossing and successful recovery', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockShared.fetchTodayHabits.mockResolvedValue([
      quest,
      { ...quest, id: 'quantity', name: 'Drink water', targetCount: 2, progressCount: 1 },
      { ...quest, id: 'recovery', name: 'Recover', frozen: true },
    ]);
    mockShared.incrementHabitProgress.mockResolvedValue(2);
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));

    await act(async () => { currentStore!.adjustProgress('quantity', 1); });
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1));
    await act(async () => { await currentStore!.completeRecovery('recovery'); });
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(2));
  });

  it('plays once for a crossing: a second tap at the target changes nothing and is not sent', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockShared.fetchTodayHabits.mockResolvedValue([
      { ...quest, id: 'quantity', name: 'Drink water', targetCount: 2, progressCount: 1 },
    ]);
    mockShared.incrementHabitProgress.mockResolvedValue(2);
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(currentStore?.user.quests).toHaveLength(1));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));

    await act(async () => {
      currentStore!.adjustProgress('quantity', 1);
      currentStore!.adjustProgress('quantity', 1);
    });
    await waitFor(() => expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1));
    expect(mockShared.incrementHabitProgress).toHaveBeenCalledTimes(1);
  });

  it('keeps quest completion successful if the audio player cannot play', async () => {
    mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(true);
    mockAudioPlayer.seekTo.mockRejectedValueOnce(new Error('audio unavailable'));
    await mountStore();
    await waitFor(() => expect(currentStore?.soundEffectsLoaded).toBe(true));
    await waitFor(() => expect(currentStore?.user.timeZone).toBe('UTC'));

    await act(async () => { currentStore!.toggleQuest('habit-1'); });
    await waitFor(() => expect(mockCompleteHabit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockAudioPlayer.seekTo).toHaveBeenCalledWith(0));
    expect(currentStore?.questsError).toBeNull();
  });
});
