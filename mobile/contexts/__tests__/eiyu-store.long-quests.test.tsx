import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, UncertainSaveError, type LongQuest } from '@eiyu/shared';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = {
  fetchAllActiveHabits: jest.fn(),
  fetchBacklogQuests: jest.fn(),
  fetchLongQuests: jest.fn(),
  fetchProfile: jest.fn(),
  fetchStats: jest.fn(),
  fetchTodayHabits: jest.fn(),
  fetchTodayOneTimeHabits: jest.fn(),
  fetchUpcomingOneTimeHabits: jest.fn(),
  setStageDoneWithReceipt: jest.fn(),
  saveAtomicLongQuest: jest.fn(),
  deleteLongQuest: jest.fn(),
};
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

jest.doMock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), ...mockShared }));
jest.doMock('@/contexts/theme-store', () => {
  const { darkTheme } = jest.requireActual('@/constants/eiyu-theme');
  const stub = { mode: 'dark', palette: 'cyan', darkMode: true, theme: darkTheme, setMode: () => {}, setPalette: () => {} };
  return { useAppTheme: () => stub };
});
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.doMock('@/lib/notifications', () => mockNative);
jest.doMock('@/lib/notification-prefs', () => mockPreference);
jest.doMock('@/lib/sound-effects-prefs', () => mockSoundPreference);
jest.doMock('expo-network', () => mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: jest.fn(() => mockAudioPlayer) }));

const { useEiyu, EiyuProvider } = require('../eiyu-store') as typeof import('../eiyu-store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const chain = (): LongQuest => ({
  id: 'lq-1', name: 'Launch', stat: 'INT', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [
    { id: 's1', name: 'Plan', done: false, description: null },
    { id: 's2', name: 'Build', done: false, description: null },
  ],
});
const receipt = (over: Record<string, unknown> = {}) => ({
  id: 'r1', stage_id: 's1', done: true, changed: true, replayed: false,
  components: [{ kind: 'stage', stat: 'INT', delta: 20 }],
  totals: [{ stat: 'INT', before: 0, after: 20, delta: 20 }],
  ...over,
});
const draft = { name: 'Launch', stat: 'INT' as const, description: 'why', stages: [{ id: null, name: 'Plan', description: null }] };

let currentStore: ReturnType<typeof useEiyu> | null = null;
let activeClient: QueryClient | null = null;
function Probe() {
  currentStore = useEiyu();
  return <Text>{currentStore.stageRewardNotice ?? ''}</Text>;
}
async function mountStore() {
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(<QueryClientProvider client={activeClient}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
  await waitFor(() => expect(currentStore?.user.longQuests).toHaveLength(1));
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentStore = null;
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([chain()]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'Test', userClass: 'Ranger', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchTodayHabits.mockResolvedValue([]);
  mockShared.fetchTodayOneTimeHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  mockShared.setStageDoneWithReceipt.mockResolvedValue(receipt());
  mockShared.saveAtomicLongQuest.mockImplementation(async (id: string) => id);
  mockShared.deleteLongQuest.mockResolvedValue(undefined);
  mockNative.cancelAllHabitReminders.mockResolvedValue(undefined);
  mockNative.ensureNotificationSetup.mockResolvedValue(undefined);
  mockNative.inspectNotificationPermissions.mockResolvedValue(true);
  mockNative.scheduleHabitReminders.mockResolvedValue(undefined);
  mockNative.scheduleOneTimeReminder.mockResolvedValue(undefined);
  mockPreference.getNotificationsEnabled.mockResolvedValue(false);
  mockSoundPreference.getSoundEffectsEnabled.mockResolvedValue(false);
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });
  mockNetwork.addNetworkStateListener.mockReturnValue({ remove: jest.fn() });
  mockAudioPlayer.seekTo.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); activeClient?.clear(); activeClient = null; });

describe('completing a stage', () => {
  it('sends the stage with a UUID request id and exposes the reward receipt and a notice', async () => {
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.rewardReceipt).toMatchObject({ id: 'r1' }));
    expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledWith('s1', true, expect.stringMatching(UUID));
    expect(currentStore?.stageRewardNotice).toBe('Stage completed.');
    expect(currentStore?.longQuestsError).toBeNull();
  });

  it('reports a replayed receipt as a confirmation with no new reward card', async () => {
    mockShared.setStageDoneWithReceipt.mockResolvedValue(receipt({ replayed: true }));
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.stageRewardNotice).toBe('Stage confirmed.'));
    expect(currentStore?.rewardReceipt).toBeNull();
  });

  it('says a stage was undone, and that an unchanged one was already saved', async () => {
    mockShared.fetchLongQuests.mockResolvedValue([{ ...chain(), stages: [{ id: 's1', name: 'Plan', done: true, description: null }, { id: 's2', name: 'Build', done: false, description: null }] }]);
    mockShared.setStageDoneWithReceipt.mockResolvedValue(receipt({ done: false }));
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.stageRewardNotice).toBe('Stage undone.'));
    expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledWith('s1', false, expect.any(String));
    mockShared.setStageDoneWithReceipt.mockResolvedValue(receipt({ done: false, changed: false }));
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.stageRewardNotice).toBe('Stage already saved.'));
  });

  it('marks the stage pending while the request is in flight and clears it after', async () => {
    let finish!: (value: unknown) => void;
    mockShared.setStageDoneWithReceipt.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    expect(currentStore?.pendingStageIds).toEqual(['s1']);
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledTimes(1);
    await act(async () => { finish(receipt()); });
    await waitFor(() => expect(currentStore?.pendingStageIds).toEqual([]));
  });

  it('keeps the same request id after an uncertain failure so a retry cannot pay twice', async () => {
    mockShared.setStageDoneWithReceipt.mockRejectedValueOnce(new UncertainSaveError());
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.longQuestsError).toMatch(/uncertain/i));
    expect(currentStore?.rewardReceipt).toBeNull();
    expect(currentStore?.stageRewardNotice).toBeNull();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledTimes(2));
    const [first, second] = mockShared.setStageDoneWithReceipt.mock.calls;
    expect(second[2]).toBe(first[2]);
  });

  it('uses a new request id after a confirmed success, and reloads the chain after a failure', async () => {
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.rewardReceipt).not.toBeNull());
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledTimes(2));
    expect(mockShared.setStageDoneWithReceipt.mock.calls[1][2]).not.toBe(mockShared.setStageDoneWithReceipt.mock.calls[0][2]);

    mockShared.setStageDoneWithReceipt.mockRejectedValueOnce(new Error('boom'));
    const reads = mockShared.fetchLongQuests.mock.calls.length;
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.longQuestsError).toMatch(/boom/));
    await waitFor(() => expect(mockShared.fetchLongQuests.mock.calls.length).toBeGreaterThan(reads));
  });

  it('ignores a stage that does not exist', async () => {
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 'nope'); currentStore!.toggleStage('missing', 's1'); });
    expect(mockShared.setStageDoneWithReceipt).not.toHaveBeenCalled();
  });

  it('clears the reward card and notice on request', async () => {
    await mountStore();
    await act(async () => { currentStore!.toggleStage('lq-1', 's1'); });
    await waitFor(() => expect(currentStore?.rewardReceipt).not.toBeNull());
    await act(async () => { currentStore!.clearStageReward(); });
    expect(currentStore?.rewardReceipt).toBeNull();
    expect(currentStore?.stageRewardNotice).toBeNull();
  });
});

describe('saving a long quest', () => {
  it('creates with a fresh id and request id, create=true and no original name', async () => {
    await mountStore();
    await act(async () => { await currentStore!.saveLongQuest(draft); });
    const [id, requestId, input, create, original] = mockShared.saveAtomicLongQuest.mock.calls[0];
    expect(id).toMatch(UUID);
    expect(requestId).toMatch(UUID);
    expect(requestId).not.toBe(id);
    expect(input).toBe(draft);
    expect(create).toBe(true);
    expect(original).toBeUndefined();
  });

  it('edits the existing id with create=false and the saved name for the grandfather check', async () => {
    await mountStore();
    await act(async () => { await currentStore!.saveLongQuest(draft, 'lq-1'); });
    const [id, , , create, original] = mockShared.saveAtomicLongQuest.mock.calls[0];
    expect([id, create, original]).toEqual(['lq-1', false, 'Launch']);
  });

  it('retries an uncertain create with the same id and request id, then uses new ones for the next create', async () => {
    mockShared.saveAtomicLongQuest.mockRejectedValueOnce(new UncertainSaveError());
    await mountStore();
    await act(async () => { await expect(currentStore!.saveLongQuest(draft)).rejects.toBeInstanceOf(UncertainSaveError); });
    await act(async () => { await currentStore!.saveLongQuest(draft); });
    const [first, second] = mockShared.saveAtomicLongQuest.mock.calls;
    expect([second[0], second[1]]).toEqual([first[0], first[1]]);
    await act(async () => { await currentStore!.saveLongQuest(draft); });
    const third = mockShared.saveAtomicLongQuest.mock.calls[2];
    expect(third[0]).not.toBe(first[0]);
    expect(third[1]).not.toBe(first[1]);
  });

  it('lets the next attempt start over once the caller abandons an uncertain save', async () => {
    mockShared.saveAtomicLongQuest.mockRejectedValueOnce(new UncertainSaveError());
    await mountStore();
    await act(async () => { await expect(currentStore!.saveLongQuest(draft)).rejects.toBeInstanceOf(UncertainSaveError); });
    await act(async () => { currentStore!.forgetLongQuestSave(); });
    await act(async () => { await currentStore!.saveLongQuest(draft); });
    const [first, second] = mockShared.saveAtomicLongQuest.mock.calls;
    expect(second[0]).not.toBe(first[0]);
  });

  it('refreshes the list after a save, and rethrows a confirmed failure for the editor to show', async () => {
    await mountStore();
    const reads = mockShared.fetchLongQuests.mock.calls.length;
    await act(async () => { await currentStore!.saveLongQuest(draft); });
    await waitFor(() => expect(mockShared.fetchLongQuests.mock.calls.length).toBeGreaterThan(reads));
    mockShared.saveAtomicLongQuest.mockRejectedValueOnce(new Error('Quest name must contain visible text'));
    await act(async () => { await expect(currentStore!.saveLongQuest(draft, 'lq-1')).rejects.toThrow('visible text'); });
  });
});
