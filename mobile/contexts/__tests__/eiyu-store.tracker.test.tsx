import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { initialUser, type HabitEditorInput, type LongQuest, type Quest, type TrackerAccess } from '@eiyu/shared';
import { Text } from 'react-native';
import { installExpoNetworkMock } from '@/test-support/install-expo-network-mock';
import { trackerAccess } from '@/test-support/tracker-fixtures';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockOrder: string[] = [];
const mockShared = {
  fetchTrackerAccess: jest.fn(), prepareDay: jest.fn(), subscribeTrackerAccessChanges: jest.fn(), trackerErrorKind: jest.fn(),
  createHabit: jest.fn(), updateHabit: jest.fn(), archiveHabit: jest.fn(), deleteHabit: jest.fn(), restoreHabit: jest.fn(),
  moveBacklogToOneTime: jest.fn(), moveOneTimeToBacklog: jest.fn(), reorderQuests: jest.fn(),
  completeHabit: jest.fn(), undoCompletion: jest.fn(), incrementHabitProgress: jest.fn(), completeHabitRecovery: jest.fn(),
  fetchTodayHabits: jest.fn(), fetchBacklogQuests: jest.fn(), fetchLongQuests: jest.fn(), fetchProfile: jest.fn(), fetchStats: jest.fn(),
  fetchAllActiveHabits: jest.fn(), fetchUpcomingOneTimeHabits: jest.fn(),
  setStageDoneWithReceipt: jest.fn(), saveAtomicLongQuest: jest.fn(), deleteLongQuest: jest.fn(), reorderLongQuests: jest.fn(),
};
const mockQueue = {
  options: null as null | { send: (entry: unknown) => Promise<unknown> },
  enqueue: jest.fn(), flush: jest.fn(), sweep: jest.fn(), retry: jest.fn(), dismiss: jest.fn(),
};
const mockNetwork = { getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() };

jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  copyTrackerRevision: (revision: object) => ({ ...revision }),
  ...mockShared,
}));
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
  useWriteQueue: (options: { send: (entry: unknown) => Promise<unknown> }) => {
    mockQueue.options = options;
    return { entries: [], offline: false, enqueue: mockQueue.enqueue, flush: mockQueue.flush, sweep: mockQueue.sweep, retry: mockQueue.retry, dismiss: mockQueue.dismiss };
  },
}));
installExpoNetworkMock(mockNetwork);
jest.doMock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn(), volume: 1 }) }));

const { useEiyu, EiyuProvider, shouldPersistQuery } = require('../eiyu-store') as typeof import('../eiyu-store');

const base = { description: null, easyVersion: 'x', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, questType: 'habit', difficulty: 'Medium', stat: 'STR' } as const;
const basicQuest = { ...base, id: 'b1', name: 'Quest 1', inputKind: 'basic', canWrite: true } as unknown as Quest;
const countQuest = { ...base, id: 'b2', name: 'Quest 2', targetCount: 5, inputKind: 'basic', canWrite: true } as unknown as Quest;
const customQuest = { ...base, id: 'c1', name: 'Morning walk', inputKind: 'custom', canWrite: true } as unknown as Quest;
const legacyQuest = { ...base, id: 'l1', name: 'Old habit' } as unknown as Quest;
const basicChain = { id: 'ch1', name: 'Chain 1', stat: 'INT', stages: [{ id: 's1', name: 'Stage 1', done: false }], inputKind: 'basic', canWrite: true } as unknown as LongQuest;
const customChain = { id: 'ch2', name: 'Plan', stat: 'INT', stages: [{ id: 's2', name: 'Step', done: false }], inputKind: 'custom', canWrite: true } as unknown as LongQuest;

const basicInput: HabitEditorInput = { mode: 'basic', values: { questType: 'habit', stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1], targetCount: null, timeSet: true, scheduledDate: null } };
const customInput: HabitEditorInput = { mode: 'custom', values: { name: 'Run', easyVersion: 'Walk', stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1], questType: 'habit', description: null, scheduledDate: null, targetCount: null, genre: null, timeSet: true } };

let store: ReturnType<typeof useEiyu> | null = null;
function Probe() { store = useEiyu(); return <Text>{store.questsError ?? ''}</Text>; }

async function attempt(run: () => Promise<unknown>): Promise<unknown> {
  let failure: unknown;
  await act(async () => { try { await run(); } catch (err) { failure = err; } });
  return failure;
}
async function expectRejects(run: () => Promise<unknown>, message?: string | RegExp) {
  const failure = await attempt(run);
  expect(failure).toBeInstanceOf(Error);
  if (message) expect((failure as Error).message).toMatch(message);
}

let access: TrackerAccess;
let activeClient: QueryClient | null = null;
async function mount(over: Partial<TrackerAccess> = {}) {
  access = trackerAccess(over, 'owner-a');
  mockShared.fetchTrackerAccess.mockImplementation(async () => { mockOrder.push('access'); return access; });
  activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(<QueryClientProvider client={activeClient}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
  await waitFor(() => expect(store?.user.quests.length).toBe(4));
  await waitFor(() => expect(store?.tracker).toBeTruthy());
  await waitFor(() => expect(store?.user.longQuests.length).toBe(2));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store = null;
  for (const fn of [...Object.values(mockShared), ...Object.values(mockQueue), ...Object.values(mockNetwork)]) if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  mockOrder.length = 0;
  mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockNetwork.addNetworkStateListener.mockImplementation(() => ({ remove: jest.fn() }));
  mockShared.subscribeTrackerAccessChanges.mockReturnValue(() => undefined);
  mockShared.trackerErrorKind.mockReturnValue(null);
  mockShared.prepareDay.mockImplementation(async () => { mockOrder.push('prepare'); return { basicPrepared: true, protectedPrepared: true, accessChanged: false }; });
  mockShared.fetchTodayHabits.mockImplementation(async () => { mockOrder.push('habits'); return [basicQuest, countQuest, customQuest, legacyQuest]; });
  mockShared.fetchBacklogQuests.mockResolvedValue([]);
  mockShared.fetchLongQuests.mockResolvedValue([basicChain, customChain]);
  mockShared.fetchProfile.mockResolvedValue({ displayName: 'A', userClass: 'Hunter', timeZone: 'UTC' });
  mockShared.fetchStats.mockResolvedValue(initialUser.stats);
  mockShared.fetchAllActiveHabits.mockResolvedValue([]);
  mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue([]);
  for (const fn of ['createHabit', 'updateHabit', 'archiveHabit', 'deleteHabit', 'restoreHabit', 'moveBacklogToOneTime', 'moveOneTimeToBacklog', 'reorderQuests', 'completeHabit', 'undoCompletion', 'completeHabitRecovery', 'deleteLongQuest', 'reorderLongQuests', 'saveAtomicLongQuest'] as const) mockShared[fn].mockResolvedValue(undefined);
  mockShared.incrementHabitProgress.mockResolvedValue(1);
  mockShared.setStageDoneWithReceipt.mockResolvedValue({ done: true, changed: true, replayed: false });
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

const rev = () => access.revision;
const snap = (id: string, inputKind: 'basic' | 'custom', kind: 'habit' | 'chain' = 'habit') => [{ kind, id, inputKind }];

describe('Board preparation', () => {
  it('reads access, prepares the day with a copy of that revision, then reads the board, once', async () => {
    await mount();
    expect(mockOrder.slice(0, 3)).toEqual(['access', 'prepare', 'habits']);
    expect(mockShared.prepareDay).toHaveBeenCalledTimes(1);
    expect(mockShared.prepareDay.mock.calls[0][0]).toEqual(rev());
    expect(mockShared.prepareDay.mock.calls[0][0]).not.toBe(rev());
  });

  it('still reads history when preparation fails', async () => {
    mockShared.prepareDay.mockRejectedValue(new Error('prepare down'));
    await mount();
    expect(store!.user.quests).toHaveLength(4);
  });

  it('prepares the day whatever the capability says, and still reads history', async () => {
    await mount({ canWriteBasic: false, canWriteCustom: false, customConsent: false, fitnessConsent: false, canWriteFitness: false });
    expect(mockShared.prepareDay).toHaveBeenCalledTimes(1);
    expect(mockShared.prepareDay.mock.calls[0][0]).toEqual(rev());
    expect(store!.user.quests).toHaveLength(4);
  });

  it('re-reads access when preparation reports a change', async () => {
    mockShared.prepareDay.mockResolvedValue({ basicPrepared: true, protectedPrepared: false, accessChanged: true });
    await mount();
    await waitFor(() => expect(mockShared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(1));
  });

  it('never adopts another account capability', async () => {
    mockShared.fetchTrackerAccess.mockResolvedValue(trackerAccess({}, 'owner-b'));
    activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await render(<QueryClientProvider client={activeClient}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
    await waitFor(() => expect(store?.user.quests.length).toBe(4));
    expect(store!.tracker).toBeNull();
    await expectRejects(() => store!.saveHabit(basicInput), 'Tracker access unavailable.');
    expect(mockShared.createHabit).not.toHaveBeenCalled();
  });
});

describe('capability is never persisted', () => {
  it('keeps tracker queries out of the persisted cache and everything else in', () => {
    const query = (queryKey: unknown[]) => ({ queryKey, state: { status: 'success' } }) as never;
    expect(shouldPersistQuery(query(['tracker', 'owner-a']))).toBe(false);
    expect(shouldPersistQuery(query(['habits', 'today', 'owner-a']))).toBe(true);
  });
});

describe('writes carry the captured revision and target snapshots', () => {
  it('creates a basic quest with a stable creation id kept across an uncertain retry', async () => {
    await mount();
    mockShared.createHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.saveHabit(basicInput));
    await act(() => store!.saveHabit(basicInput));
    expect(mockShared.createHabit).toHaveBeenCalledTimes(2);
    const [owner, input, expected, creationId] = mockShared.createHabit.mock.calls[0];
    expect([owner, input, expected]).toEqual(['owner-a', basicInput, rev()]);
    expect(expected).not.toBe(rev());
    expect(mockShared.createHabit.mock.calls[1][3]).toBe(creationId);
    await act(() => store!.saveHabit(basicInput));
    expect(mockShared.createHabit.mock.calls[2][3]).not.toBe(creationId);
  });

  it('uses a new creation id after a confirmed tracker refusal', async () => {
    await mount();
    mockShared.trackerErrorKind.mockReturnValue('invalid-input');
    mockShared.createHabit.mockRejectedValueOnce(Object.assign(new Error('bad'), { code: '22023' }));
    await expectRejects(() => store!.saveHabit(basicInput));
    mockShared.trackerErrorKind.mockReturnValue(null);
    await act(() => store!.saveHabit(basicInput));
    expect(mockShared.createHabit.mock.calls[1][3]).not.toBe(mockShared.createHabit.mock.calls[0][3]);
  });

  it('edits with the root snapshot and the original name', async () => {
    await mount();
    await act(() => store!.saveHabit(basicInput, 'b1'));
    expect(mockShared.updateHabit).toHaveBeenCalledWith('b1', basicInput, rev(), snap('b1', 'basic'), 'Quest 1');
  });

  it('sends progress with the snapshot (mailbox state plays no part)', async () => {
    await mount();
    await act(async () => { store!.adjustProgress('b2', 1); });
    expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'progress', habitId: 'b2', trackerAccess: access, trackerTargets: snap('b2', 'basic'),
    }));
  });

  it('archives, restores, deletes and moves with the snapshot', async () => {
    await mount();
    await act(() => store!.archiveQuest('b1'));
    await act(() => store!.restoreQuest('b1'));
    await act(() => store!.deleteQuest('c1'));
    await act(() => store!.moveToOneTime('b1'));
    await act(() => store!.moveToBacklog('b1'));
    expect(mockShared.archiveHabit).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(mockShared.restoreHabit).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(mockShared.deleteHabit).toHaveBeenCalledWith('c1', rev(), snap('c1', 'custom'));
    expect(mockShared.moveBacklogToOneTime).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(mockShared.moveOneTimeToBacklog).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
  });

  it('reorders with one snapshot per distinct id', async () => {
    await mount();
    await act(() => store!.reorderQuests('habit', ['b1', 'b2', 'b1']));
    expect(mockShared.reorderQuests).toHaveBeenCalledWith('habit', ['b1', 'b2', 'b1'], rev(), [...snap('b1', 'basic'), ...snap('b2', 'basic')]);
  });

  it('carries chain snapshots on stage, save, delete and reorder', async () => {
    await mount();
    await act(async () => { await store!.toggleStage('ch1', 's1'); });
    expect(mockShared.setStageDoneWithReceipt).toHaveBeenCalledWith('s1', true, expect.any(String), rev(), snap('ch1', 'basic', 'chain'));
    const editor = { mode: 'basic' as const, values: { stat: 'INT' as const, stages: [{ id: 's1' }] } };
    await act(() => store!.saveLongQuest(editor, 'ch1'));
    expect(mockShared.saveAtomicLongQuest).toHaveBeenCalledWith('ch1', expect.any(String), editor, false, rev(), snap('ch1', 'basic', 'chain'), 'Chain 1');
    await act(() => store!.removeLongQuest('ch2'));
    expect(mockShared.deleteLongQuest).toHaveBeenCalledWith('ch2', rev(), snap('ch2', 'custom', 'chain'));
    await act(() => store!.reorderChains(['ch1', 'ch2']));
    expect(mockShared.reorderLongQuests).toHaveBeenCalledWith(['ch1', 'ch2'], rev(), [...snap('ch1', 'basic', 'chain'), ...snap('ch2', 'custom', 'chain')]);
  });
});

describe('queued progress work', () => {
  it('hands the queue the capability and the root snapshot, and nothing else about permission', async () => {
    await mount();
    await act(async () => { store!.toggleQuest('b1'); });
    expect(mockQueue.enqueue).toHaveBeenCalledWith({ kind: 'complete', habitId: 'b1', label: 'Quest 1', trackerAccess: access, trackerTargets: snap('b1', 'basic') });
  });

  it('enqueues a custom, unclassified or counted quest whatever the capability says, with its own snapshot', async () => {
    await mount({ customConsent: false, canWriteCustom: false, canWriteBasic: false });
    await act(async () => { store!.toggleQuest('c1'); store!.toggleQuest('l1'); store!.adjustProgress('b2', 1); });
    expect(mockQueue.enqueue).toHaveBeenCalledTimes(3);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'c1', trackerTargets: snap('c1', 'custom') }));
    expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'l1', trackerTargets: snap('l1', 'custom') }));
    expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'progress', habitId: 'b2', trackerTargets: snap('b2', 'basic') }));
    expect(store!.questsError).toBeNull();
  });

  it('says plainly to reload, re-reads access and does not flush when the queue refuses', async () => {
    await mount();
    const before = mockShared.fetchTrackerAccess.mock.calls.length;
    mockQueue.enqueue.mockReturnValue(false);
    mockQueue.flush.mockClear();
    await act(async () => { store!.toggleQuest('b1'); });
    expect(mockQueue.flush).not.toHaveBeenCalled();
    expect(store!.questsError).toMatch(/Reload and try again/);
    expect(store!.questsError).not.toMatch(/permission|read-only|Edit details/i);
    await waitFor(() => expect(mockShared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(before));
  });

  it('enqueues nothing while no capability has been read and no stored marker stands in', async () => {
    mockShared.fetchTrackerAccess.mockRejectedValue(new Error('down'));
    activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await render(<QueryClientProvider client={activeClient}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
    await waitFor(() => expect(store?.user.quests.length).toBe(4));
    await act(async () => { store!.toggleQuest('b1'); });
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
    expect(store!.questsError).toBe('Tracker access unavailable.');
  });

  it('sends with the entry revision and targets, never a fresh one', async () => {
    await mount();
    const entry = { id: 'e1', userId: 'owner-a', kind: 'complete', habitId: 'b1', accountDate: '2026-10-24', trackerRevision: { userId: 'owner-a', ageVersion: 1, consentVersion: 7, authorityVersion: 0 }, trackerTargets: snap('b1', 'basic') };
    await act(async () => { await mockQueue.options!.send(entry); });
    expect(mockShared.completeHabit).toHaveBeenCalledWith('owner-a', 'b1', 'STR', 'full', entry.trackerRevision, entry.trackerTargets, '2026-10-24', 'UTC');
    mockShared.fetchTrackerAccess.mockClear();
    await act(async () => { await mockQueue.options!.send({ ...entry, kind: 'progress', delta: 2 }); });
    expect(mockShared.incrementHabitProgress).toHaveBeenCalledWith('b1', '2026-10-24', 2, entry.trackerRevision, entry.trackerTargets);
    expect(mockShared.fetchTrackerAccess).not.toHaveBeenCalled();
  });

  it('refuses to send an entry that has no captured revision or targets', async () => {
    await mount();
    const bare = { id: 'e2', userId: 'owner-a', kind: 'complete', habitId: 'b1', accountDate: '2026-10-24' };
    await expect(mockQueue.options!.send(bare)).rejects.toThrow();
    expect(mockShared.completeHabit).not.toHaveBeenCalled();
  });

  it('lets a refused completion reach the queue, which decides what it means', async () => {
    await mount();
    const error = Object.assign(new Error('refused'), { code: '22023' });
    mockShared.completeHabit.mockRejectedValue(error);
    const entry = { id: 'e3', userId: 'owner-a', kind: 'complete', habitId: 'b1', accountDate: '2026-10-24', trackerRevision: rev(), trackerTargets: snap('b1', 'basic') };
    await expect(mockQueue.options!.send(entry)).rejects.toBe(error);
  });

  it('retrySync returns the queue answer so a caller can await it', async () => {
    await mount();
    mockQueue.retry.mockResolvedValueOnce(false);
    let answer: boolean | undefined;
    await act(async () => { answer = await store!.retrySync('e1'); });
    expect(answer).toBe(false);
    expect(mockQueue.retry).toHaveBeenCalledWith('e1');
  });
});

describe('the store holds no permission layer', () => {
  // A capability that says no to everything: the app must not act on it, only the gateway may.
  const closed = { customConsent: false, fitnessConsent: false, canWriteCustom: false, canWriteFitness: false, canWriteBasic: false } as const;

  it('sends custom content, a basic quest and a chain whatever the capability says', async () => {
    await mount(closed);
    await act(() => store!.saveHabit(customInput));
    await act(() => store!.saveHabit(basicInput));
    expect(mockShared.createHabit).toHaveBeenCalledTimes(2);
    const customChainInput = { mode: 'custom' as const, values: { name: 'Plan', stat: 'INT' as const, strictOrder: true, stages: [{ name: 'Step' }] } };
    await act(() => store!.saveLongQuest(customChainInput));
    expect(mockShared.saveAtomicLongQuest).toHaveBeenCalledTimes(1);
  });

  it('writes a custom, basic or unclassified quest alike: save, archive, delete, move and reorder', async () => {
    await mount(closed);
    await act(() => store!.saveHabit(customInput, 'c1'));
    await act(() => store!.saveHabit(customInput, 'l1'));
    await act(() => store!.archiveQuest('c1'));
    await act(() => store!.deleteQuest('l1'));
    await act(() => store!.moveToBacklog('l1'));
    await act(() => store!.reorderQuests('habit', ['b1', 'l1']));
    expect(mockShared.updateHabit).toHaveBeenCalledWith('c1', customInput, rev(), snap('c1', 'custom'), 'Morning walk');
    expect(mockShared.updateHabit).toHaveBeenCalledWith('l1', customInput, rev(), snap('l1', 'custom'), 'Old habit');
    expect(mockShared.archiveHabit).toHaveBeenCalledWith('c1', rev(), snap('c1', 'custom'));
    expect(mockShared.deleteHabit).toHaveBeenCalledWith('l1', rev(), snap('l1', 'custom'));
    expect(mockShared.moveOneTimeToBacklog).toHaveBeenCalledWith('l1', rev(), snap('l1', 'custom'));
    expect(mockShared.reorderQuests).toHaveBeenCalledWith('habit', ['b1', 'l1'], rev(), [...snap('b1', 'basic'), ...snap('l1', 'custom')]);
  });

  it('ignores a record whose canWrite flag is false', async () => {
    mockShared.fetchTodayHabits.mockResolvedValue([{ ...basicQuest, canWrite: false }, countQuest, customQuest, { ...legacyQuest, canWrite: false }]);
    await mount(closed);
    await act(() => store!.archiveQuest('b1'));
    expect(mockShared.archiveHabit).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
  });

  it('exposes no audience, grant or refresh helper', async () => {
    await mount();
    for (const key of ['audience', 'acceptTracker', 'refreshTracker']) expect(store).not.toHaveProperty(key);
    expect(store!.tracker).toBeTruthy();
  });

  it('still does not let a custom quest or chain go back to basic tracking', async () => {
    await mount();
    await expectRejects(() => store!.saveHabit(basicInput, 'c1'), /custom details/i);
    await expectRejects(() => store!.saveLongQuest({ mode: 'basic', values: { stat: 'INT', stages: [{ id: 's2' }] } }, 'ch2'), /custom details/i);
    expect(mockShared.updateHabit).not.toHaveBeenCalled();
    expect(mockShared.saveAtomicLongQuest).not.toHaveBeenCalled();
  });

  it('refuses every write while access is unavailable', async () => {
    mockShared.fetchTrackerAccess.mockRejectedValue(new Error('down'));
    activeClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await render(<QueryClientProvider client={activeClient}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
    await waitFor(() => expect(store?.user.quests.length).toBe(4));
    await expectRejects(() => store!.saveHabit(basicInput), 'Tracker access unavailable.');
    await expectRejects(() => store!.archiveQuest('b1'), 'Tracker access unavailable.');
    expect(mockShared.createHabit).not.toHaveBeenCalled();
    expect(mockShared.archiveHabit).not.toHaveBeenCalled();
  });

  it('words a gateway refusal as a plain reload message, with no permission screen to point at', async () => {
    await mount();
    mockShared.trackerErrorKind.mockReturnValue('purpose-required');
    mockShared.createHabit.mockRejectedValueOnce(Object.assign(new Error('purpose'), { code: 'EP001' }));
    const failure = await attempt(() => store!.saveHabit(customInput));
    expect((failure as Error).message).toMatch(/Reload and try again/);
    expect((failure as Error).message).not.toMatch(/permission|Edit details/i);
  });
});

describe('a stale save and late server facts', () => {
  it('refreshes access and the board, rejects with a clear reason, and never retries', async () => {
    await mount();
    const before = mockShared.fetchTrackerAccess.mock.calls.length;
    mockShared.trackerErrorKind.mockReturnValue('access-changed');
    mockShared.updateHabit.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
    await expectRejects(() => store!.saveHabit(basicInput, 'b1'), /permissions or this record changed/i);
    expect(mockShared.updateHabit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockShared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(before));
    expect(mockShared.updateHabit).toHaveBeenCalledTimes(1);
  });

  it('reports a 42501 after a delete the server had already answered with a failure', async () => {
    await mount();
    mockShared.trackerErrorKind.mockReturnValue(null);
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'XX000' }));
    await expectRejects(() => store!.deleteQuest('b1'));
    mockShared.trackerErrorKind.mockReturnValue('denied');
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await expectRejects(() => store!.deleteQuest('b1'));
  });

  it('reports a 42501 that means something other than the quest being gone, after an unanswered delete', async () => {
    await mount();
    mockShared.trackerErrorKind.mockReturnValue(null);
    mockShared.deleteHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.deleteQuest('b1'));
    mockShared.trackerErrorKind.mockReturnValue('denied');
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Account changed.'), { code: '42501' }));
    await expectRejects(() => store!.deleteQuest('b1'));
  });

  it('forgets an unanswered delete once the server has answered a later attempt with a failure', async () => {
    await mount();
    mockShared.trackerErrorKind.mockReturnValue(null);
    mockShared.deleteHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.deleteQuest('b1'));
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'XX000' }));
    await expectRejects(() => store!.deleteQuest('b1'));
    mockShared.trackerErrorKind.mockReturnValue('denied');
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await expectRejects(() => store!.deleteQuest('b1'));
  });

  it('settles a delete retry that gets 42501 after its own earlier attempt, but not a first delete', async () => {
    await mount();
    mockShared.deleteHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.deleteQuest('b1'));
    mockShared.trackerErrorKind.mockReturnValue('denied');
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await act(async () => { await store!.deleteQuest('b1'); });
    expect(mockShared.deleteHabit).toHaveBeenCalledTimes(2);
    await expectRejects(() => store!.saveHabit(basicInput, 'b1'), /deleted/);
    mockShared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await expectRejects(() => store!.deleteQuest('b2'));
  });

  it('reloads the lane and shows the refusal when a reorder is out of date', async () => {
    await mount();
    const before = mockShared.fetchTodayHabits.mock.calls.length;
    mockShared.trackerErrorKind.mockReturnValue('access-changed');
    mockShared.reorderQuests.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
    await expectRejects(() => store!.reorderQuests('habit', ['b2', 'b1']));
    await waitFor(() => expect(mockShared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(before));
    expect(mockShared.reorderQuests).toHaveBeenCalledTimes(1);
  });
});

describe('Reminders and widget respect the custom purpose', () => {
  const notifications = () => require('@/lib/notifications') as Record<string, jest.Mock>;
  const prefs = () => require('@/lib/notification-prefs') as Record<string, jest.Mock>;
  const reminderRows = () => [
    { id: 'b1', name: 'Quest 1', time: '08:00', days: [1], inputKind: 'basic' },
    { id: 'c1', name: 'Morning walk', time: '08:00', days: [1], inputKind: 'custom' },
    { id: 'l1', name: 'Old habit', time: '08:00', days: [1] },
  ];
  const oneTimeRows = () => [
    { id: 'o1', name: 'Quest 9', time: '09:00', date: '2026-10-30', inputKind: 'basic' },
    { id: 'o2', name: 'Dentist', time: '09:00', date: '2026-10-30', inputKind: 'custom' },
  ];
  beforeEach(() => {
    prefs().getNotificationsEnabled.mockResolvedValue(true);
    for (const name of ['scheduleHabitReminders', 'scheduleOneTimeReminder', 'notifyRecoveryQuestGenerated']) notifications()[name].mockClear();
  });
  afterEach(() => { prefs().getNotificationsEnabled.mockResolvedValue(false); });

  it('arms only basic reminders once custom permission is observed denied', async () => {
    mockShared.fetchAllActiveHabits.mockResolvedValue(reminderRows());
    mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue(oneTimeRows());
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(notifications().scheduleHabitReminders).toHaveBeenCalled());
    expect(notifications().scheduleHabitReminders.mock.calls.map(c => c[0])).toEqual(['b1']);
    expect(notifications().scheduleOneTimeReminder.mock.calls.map(c => c[0])).toEqual(['o1']);
  });

  it('keeps every reminder while custom permission is granted', async () => {
    mockShared.fetchAllActiveHabits.mockResolvedValue(reminderRows());
    mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue(oneTimeRows());
    await mount({ customConsent: true, canWriteCustom: true });
    await waitFor(() => expect(notifications().scheduleHabitReminders).toHaveBeenCalledTimes(3));
    expect(notifications().scheduleOneTimeReminder.mock.calls.map(c => c[0]).sort()).toEqual(['o1', 'o2']);
  });

  it('arms every reminder when the server reports every write open, with no consent flag set', async () => {
    mockShared.fetchAllActiveHabits.mockResolvedValue(reminderRows());
    mockShared.fetchUpcomingOneTimeHabits.mockResolvedValue(oneTimeRows());
    await mount({ customConsent: false, fitnessConsent: false, canWriteBasic: true, canWriteCustom: true, canWriteFitness: true });
    await waitFor(() => expect(notifications().scheduleHabitReminders).toHaveBeenCalledTimes(3));
    expect(notifications().scheduleOneTimeReminder.mock.calls.map(c => c[0]).sort()).toEqual(['o1', 'o2']);
  });

  it('announces a newly frozen custom quest by name when the server reports every write open', async () => {
    await mount({ customConsent: false, fitnessConsent: false, canWriteBasic: true, canWriteCustom: true, canWriteFitness: true });
    mockShared.fetchTodayHabits.mockResolvedValue([basicQuest, countQuest, { ...customQuest, frozen: true }, legacyQuest]);
    await act(async () => { await activeClient!.invalidateQueries(); });
    await waitFor(() => expect(notifications().notifyRecoveryQuestGenerated).toHaveBeenCalledWith('Morning walk'));
  });

  it('announces a newly frozen protected quest without its name when custom permission is denied', async () => {
    await mount({ customConsent: false, canWriteCustom: false });
    mockShared.fetchTodayHabits.mockResolvedValue([basicQuest, countQuest, { ...customQuest, frozen: true }, legacyQuest]);
    await act(async () => { await activeClient!.invalidateQueries(); });
    await waitFor(() => expect(notifications().notifyRecoveryQuestGenerated).toHaveBeenCalled());
    expect(notifications().notifyRecoveryQuestGenerated).toHaveBeenCalledWith(null);
    expect(notifications().notifyRecoveryQuestGenerated).not.toHaveBeenCalledWith('Morning walk');
  });
});

describe('notice for a held change that expired', () => {
  const MESSAGE = /expired after 30 days/;
  const expiredNotice = (over: Record<string, unknown> = {}) => ({
    id: 'e1', userId: 'owner-a', kind: 'complete', habitId: 'c1', accountDate: '2026-09-01', createdAt: 1, attempts: 0, status: 'failed',
    heldForProcessingPause: true, failure: { reason: 'hold-expired', message: 'A change that was kept while permission was paused has expired after 30 days and was removed from this device. It was not saved.' },
    ...over,
  });
  const report = (entry: unknown) => act(async () => { (mockQueue.options as unknown as { onFailed: (e: unknown) => void }).onFailed(entry); });

  it('shows a plain notice without the quest name, and dismisses it', async () => {
    await mount();
    expect(store?.expiredHoldNotice).toBeNull();
    await report(expiredNotice({ label: 'Morning walk' }));
    expect(store?.expiredHoldNotice).toMatch(MESSAGE);
    expect(store?.expiredHoldNotice).not.toMatch(/Morning walk/);
    await act(async () => store?.dismissExpiredHoldNotice());
    expect(store?.expiredHoldNotice).toBeNull();
  });

  it('keeps one notice when several expire together', async () => {
    await mount();
    await report(expiredNotice({ id: 'e1' }));
    const first = store?.expiredHoldNotice;
    await report(expiredNotice({ id: 'e2' }));
    expect(store?.expiredHoldNotice).toBe(first);
  });

  it('does not raise it for other failures, which the Board already lists', async () => {
    await mount();
    await report(expiredNotice({ failure: { reason: 'server', message: 'x' } }));
    await report(expiredNotice({ failure: { reason: 'purpose-paused', message: 'x' } }));
    expect(store?.expiredHoldNotice).toBeNull();
  });

  it('still returns the board to what the server holds', async () => {
    await mount();
    mockShared.fetchTodayHabits.mockClear();
    await report(expiredNotice());
    await waitFor(() => expect(mockShared.fetchTodayHabits).toHaveBeenCalled());
  });
});
