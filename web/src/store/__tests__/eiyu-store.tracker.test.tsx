// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialUser, type HabitEditorInput, LongQuest, Quest, TrackerAccess } from '@eiyu/shared';

const shared = vi.hoisted(() => ({
  order: [] as string[],
  fetchTrackerAccess: vi.fn(), fetchAccountAge: vi.fn(), prepareDay: vi.fn(), subscribe: vi.fn(), kind: vi.fn(),
  createHabit: vi.fn(), updateHabit: vi.fn(), archiveHabit: vi.fn(), deleteHabit: vi.fn(), restoreHabit: vi.fn(),
  moveBacklogToOneTime: vi.fn(), moveOneTimeToBacklog: vi.fn(), reorderQuests: vi.fn(),
  completeHabit: vi.fn(), undoCompletion: vi.fn(), incrementHabitProgress: vi.fn(), completeHabitRecovery: vi.fn(),
  fetchTodayHabits: vi.fn(), fetchBacklogQuests: vi.fn(), fetchLongQuests: vi.fn(), fetchProfile: vi.fn(), fetchStats: vi.fn(),
  setStageDoneWithReceipt: vi.fn(), saveAtomicLongQuest: vi.fn(), deleteLongQuest: vi.fn(), reorderLongQuests: vi.fn(),
}));

vi.mock('@eiyu/shared', async () => {
  return {
    ...(await vi.importActual<typeof import('@eiyu/shared')>('@eiyu/shared')),
    fetchTrackerAccess: shared.fetchTrackerAccess,
    fetchAccountAge: shared.fetchAccountAge,
    prepareDay: shared.prepareDay,
    subscribeTrackerAccessChanges: shared.subscribe,
    trackerErrorKind: shared.kind,
    createHabit: shared.createHabit, updateHabit: shared.updateHabit, archiveHabit: shared.archiveHabit,
    deleteHabit: shared.deleteHabit, restoreHabit: shared.restoreHabit,
    moveBacklogToOneTime: shared.moveBacklogToOneTime, moveOneTimeToBacklog: shared.moveOneTimeToBacklog,
    reorderQuests: shared.reorderQuests, completeHabit: shared.completeHabit, undoCompletion: shared.undoCompletion,
    incrementHabitProgress: shared.incrementHabitProgress, completeHabitRecovery: shared.completeHabitRecovery,
    fetchTodayHabits: shared.fetchTodayHabits, fetchBacklogQuests: shared.fetchBacklogQuests, fetchLongQuests: shared.fetchLongQuests,
    fetchProfile: shared.fetchProfile, fetchStats: shared.fetchStats,
    setStageDoneWithReceipt: shared.setStageDoneWithReceipt, saveAtomicLongQuest: shared.saveAtomicLongQuest,
    deleteLongQuest: shared.deleteLongQuest, reorderLongQuests: shared.reorderLongQuests,
  };
});
vi.mock('../session-context', () => ({ useSession: () => ({ session: { user: { id: 'owner-a' } } }) }));

import { EiyuProvider, useEiyu } from '../eiyu-store';
import { trackerAccess } from '../../test/tracker-fixtures';

const base = { description: null, easyVersion: 'x', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, questType: 'habit', difficulty: 'Medium', stat: 'STR' };
const basicQuest = { ...base, id: 'b1', name: 'Quest 1', inputKind: 'basic', canWrite: true } as unknown as Quest;
const countQuest = { ...base, id: 'b2', name: 'Quest 2', targetCount: 5, inputKind: 'basic', canWrite: true } as unknown as Quest;
const customQuest = { ...base, id: 'c1', name: 'Morning walk', inputKind: 'custom', canWrite: true } as unknown as Quest;
const legacyQuest = { ...base, id: 'l1', name: 'Old habit' } as unknown as Quest;
const basicChain = { id: 'ch1', name: 'Chain 1', stat: 'INT', stages: [{ id: 's1', name: 'Stage 1', done: false }], inputKind: 'basic', canWrite: true } as unknown as LongQuest;
const customChain = { id: 'ch2', name: 'Plan', stat: 'INT', stages: [{ id: 's2', name: 'Step', done: false }], inputKind: 'custom', canWrite: true } as unknown as LongQuest;

const basicInput: HabitEditorInput = { mode: 'basic', values: { questType: 'habit', stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1], targetCount: null, timeSet: true, scheduledDate: null } };
const customInput: HabitEditorInput = { mode: 'custom', values: { name: 'Run', easyVersion: 'Walk', stat: 'STR', difficulty: 'Medium', time: '08:00', days: [1], questType: 'habit', description: null, scheduledDate: null, targetCount: null, genre: null, timeSet: true } };

let store: ReturnType<typeof useEiyu> | null = null as unknown as ReturnType<typeof useEiyu>;
function Probe() { store = useEiyu(); return null; }

/** Runs a store write inside act and returns what it rejected with, so a refusal never unbalances act. */
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
async function mount(over: Partial<TrackerAccess> = {}) {
  access = trackerAccess(over, 'owner-a');
  shared.fetchTrackerAccess.mockImplementation(async () => { shared.order.push('access'); return access; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
  await waitFor(() => expect(store?.user.quests.length).toBe(4));
  await waitFor(() => expect(store?.tracker).toBeTruthy());
  await waitFor(() => expect(store?.user.longQuests.length).toBe(2));
  return client;
}

beforeEach(() => {
  store = null;
  for (const fn of Object.values(shared)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  shared.order.length = 0;
  shared.subscribe.mockReturnValue(() => undefined);
  shared.kind.mockReturnValue(null);
  shared.prepareDay.mockImplementation(async () => { shared.order.push('prepare'); return { basicPrepared: true, protectedPrepared: true, accessChanged: false }; });
  shared.fetchTodayHabits.mockImplementation(async () => { shared.order.push('habits'); return [basicQuest, countQuest, customQuest, legacyQuest]; });
  shared.fetchBacklogQuests.mockResolvedValue([]);
  shared.fetchLongQuests.mockResolvedValue([basicChain, customChain]);
  shared.fetchProfile.mockResolvedValue({ displayName: 'A', userClass: 'Hunter', timeZone: 'UTC' });
  shared.fetchStats.mockResolvedValue(initialUser.stats);
  for (const fn of ['createHabit', 'updateHabit', 'archiveHabit', 'deleteHabit', 'restoreHabit', 'moveBacklogToOneTime', 'moveOneTimeToBacklog', 'reorderQuests', 'completeHabit', 'undoCompletion', 'completeHabitRecovery', 'deleteLongQuest', 'reorderLongQuests', 'saveAtomicLongQuest'] as const) shared[fn].mockResolvedValue(undefined);
  shared.incrementHabitProgress.mockResolvedValue(1);
  shared.setStageDoneWithReceipt.mockResolvedValue({ done: true, changed: true, replayed: false });
});
afterEach(cleanup);

const rev = () => access.revision;
const snap = (id: string, inputKind: 'basic' | 'custom', kind: 'habit' | 'chain' = 'habit') => [{ kind, id, inputKind }];

describe('Board preparation', () => {
  it('reads access, prepares the day with a copy of that revision, then reads the board, once', async () => {
    await mount();
    expect(shared.order.slice(0, 3)).toEqual(['access', 'prepare', 'habits']);
    expect(shared.prepareDay).toHaveBeenCalledTimes(1);
    expect(shared.prepareDay.mock.calls[0][0]).toEqual(rev());
    expect(shared.prepareDay.mock.calls[0][0]).not.toBe(rev());
  });

  it('still reads history when preparation fails', async () => {
    shared.prepareDay.mockRejectedValue(new Error('prepare down'));
    await mount();
    expect(store!.user.quests).toHaveLength(4);
  });

  it('does not prepare while tracker writes are paused, but still reads history', async () => {
    await mount({ canWriteBasic: false });
    expect(shared.prepareDay).not.toHaveBeenCalled();
    expect(store!.user.quests).toHaveLength(4);
  });

  it('re-reads access when preparation reports a change', async () => {
    shared.prepareDay.mockResolvedValue({ basicPrepared: true, protectedPrepared: false, accessChanged: true });
    await mount();
    await waitFor(() => expect(shared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('writes carry the captured revision and target snapshots', () => {
  it('creates a basic quest with a stable creation id kept across an uncertain retry', async () => {
    await mount();
    shared.createHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.saveHabit(basicInput), );
    await act(() => store!.saveHabit(basicInput));
    expect(shared.createHabit).toHaveBeenCalledTimes(2);
    const [owner, input, expected, creationId] = shared.createHabit.mock.calls[0];
    expect([owner, input, expected]).toEqual(['owner-a', basicInput, rev()]);
    expect(expected).not.toBe(rev());
    expect(shared.createHabit.mock.calls[1][3]).toBe(creationId);
    await act(() => store!.saveHabit(basicInput));
    expect(shared.createHabit.mock.calls[2][3]).not.toBe(creationId);
  });

  it('uses a new creation id after a confirmed tracker refusal', async () => {
    await mount();
    shared.kind.mockReturnValue('invalid-input');
    shared.createHabit.mockRejectedValueOnce(Object.assign(new Error('bad'), { code: '22023' }));
    await expectRejects(() => store!.saveHabit(basicInput), );
    shared.kind.mockReturnValue(null);
    await act(() => store!.saveHabit(basicInput));
    expect(shared.createHabit.mock.calls[1][3]).not.toBe(shared.createHabit.mock.calls[0][3]);
  });

  it('edits with the root snapshot and the original name', async () => {
    await mount();
    await act(() => store!.saveHabit(basicInput, 'b1'));
    expect(shared.updateHabit).toHaveBeenCalledWith('b1', basicInput, rev(), snap('b1', 'basic'), 'Quest 1');
  });

  it('completes, undoes and progresses basic work with the snapshot (mailbox state plays no part)', async () => {
    await mount();
    await act(() => store!.toggleQuest('b1'));
    expect(shared.completeHabit).toHaveBeenCalledWith('owner-a', 'b1', 'STR', 'full', rev(), snap('b1', 'basic'), undefined, 'UTC');
    act(() => store!.adjustProgress('b2', 1));
    await waitFor(() => expect(shared.incrementHabitProgress).toHaveBeenCalledWith('b2', expect.any(String), 1, rev(), snap('b2', 'basic')));
  });

  it('archives, restores, deletes and moves with the snapshot', async () => {
    await mount();
    await act(() => store!.archiveQuest('b1'));
    await act(() => store!.restoreQuest('b1'));
    await act(() => store!.deleteQuest('c1'));
    await act(() => store!.moveToOneTime('b1'));
    await act(() => store!.moveToBacklog('b1'));
    expect(shared.archiveHabit).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(shared.restoreHabit).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(shared.deleteHabit).toHaveBeenCalledWith('c1', rev(), snap('c1', 'custom'));
    expect(shared.moveBacklogToOneTime).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
    expect(shared.moveOneTimeToBacklog).toHaveBeenCalledWith('b1', rev(), snap('b1', 'basic'));
  });

  it('reorders with one snapshot per distinct id', async () => {
    await mount();
    await act(() => store!.reorderQuests('habit', ['b1', 'b2', 'b1']));
    expect(shared.reorderQuests).toHaveBeenCalledWith('habit', ['b1', 'b2', 'b1'], rev(), [...snap('b1', 'basic'), ...snap('b2', 'basic')]);
  });

  it('carries chain snapshots on stage, save, delete and reorder', async () => {
    await mount();
    await act(() => store!.toggleStage('ch1', 's1'));
    expect(shared.setStageDoneWithReceipt).toHaveBeenCalledWith('s1', true, expect.any(String), rev(), snap('ch1', 'basic', 'chain'));
    const editor = { mode: 'basic' as const, values: { stat: 'INT' as const, stages: [{ id: 's1' }] } };
    await act(() => store!.saveLongQuest(editor, 'ch1'));
    expect(shared.saveAtomicLongQuest).toHaveBeenCalledWith('ch1', expect.any(String), editor, false, rev(), snap('ch1', 'basic', 'chain'), 'Chain 1');
    await act(() => store!.removeLongQuest('ch2'));
    expect(shared.deleteLongQuest).toHaveBeenCalledWith('ch2', rev(), snap('ch2', 'custom', 'chain'));
    await act(() => store!.reorderChains(['ch1', 'ch2']));
    expect(shared.reorderLongQuests).toHaveBeenCalledWith(['ch1', 'ch2'], rev(), [...snap('ch1', 'basic', 'chain'), ...snap('ch2', 'custom', 'chain')]);
  });
});

describe('known denials send nothing', () => {
  it('refuses custom content without custom permission, and keeps basic creation open', async () => {
    await mount({ customConsent: false, canWriteCustom: false });
    await expectRejects(() => store!.saveHabit(customInput), /permission/i);
    expect(shared.createHabit).not.toHaveBeenCalled();
    await act(() => store!.saveHabit(basicInput));
    expect(shared.createHabit).toHaveBeenCalledTimes(1);
  });

  it('keeps a custom or unclassified quest read-only: no save, archive, delete, move or progress', async () => {
    await mount({ customConsent: false, canWriteCustom: false });
    await expectRejects(() => store!.saveHabit(basicInput, 'c1'), /read-only/i);
    await expectRejects(() => store!.archiveQuest('c1'), /read-only/i);
    await expectRejects(() => store!.deleteQuest('l1'), /read-only/i);
    await expectRejects(() => store!.moveToBacklog('l1'), /read-only/i);
    await expectRejects(() => store!.reorderQuests('habit', ['b1', 'l1']), /read-only/i);
    let toggled: boolean | undefined;
    await act(async () => { toggled = await store!.toggleQuest('c1'); });
    expect(toggled).toBe(false);
    act(() => store!.adjustProgress('l1', 1));
    for (const fn of [shared.updateHabit, shared.archiveHabit, shared.deleteHabit, shared.moveOneTimeToBacklog, shared.reorderQuests, shared.completeHabit, shared.incrementHabitProgress]) expect(fn).not.toHaveBeenCalled();
  });

  it('refuses a basic write while the account is paused (under 12)', async () => {
    await mount({ canWriteBasic: false });
    await expectRejects(() => store!.saveHabit(basicInput), /paused/i);
    await expectRejects(() => store!.archiveQuest('b1'), /paused/i);
    expect(shared.createHabit).not.toHaveBeenCalled();
    expect(shared.archiveHabit).not.toHaveBeenCalled();
  });

  it('does not turn a basic quest into a custom one without custom permission', async () => {
    await mount({ customConsent: false, canWriteCustom: false });
    await expectRejects(() => store!.saveHabit(customInput, 'b1'), /permission/i);
    expect(shared.updateHabit).not.toHaveBeenCalled();
  });

  it('refuses every write while access is unavailable', async () => {
    shared.fetchTrackerAccess.mockRejectedValue(new Error('down'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EiyuProvider><Probe /></EiyuProvider></QueryClientProvider>);
    await waitFor(() => expect(store?.user.quests.length).toBe(4));
    await expectRejects(() => store!.saveHabit(basicInput), 'Tracker access unavailable.');
    expect(shared.createHabit).not.toHaveBeenCalled();
  });
});

describe('a stale save', () => {
  it('refreshes access and the board, rejects with a clear reason, and never retries', async () => {
    await mount();
    const before = shared.fetchTrackerAccess.mock.calls.length;
    shared.kind.mockReturnValue('access-changed');
    shared.updateHabit.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
    await expectRejects(() => store!.saveHabit(basicInput, 'b1'), /permissions or this record changed/i);
    expect(shared.updateHabit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(shared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(before));
    expect(shared.updateHabit).toHaveBeenCalledTimes(1);
  });
});



describe('late server facts', () => {
  it('reports a completion refused with 22023, because completeHabit has already settled a real duplicate', async () => {
    await mount();
    shared.kind.mockReturnValue('invalid-input');
    shared.completeHabit.mockRejectedValue(Object.assign(new Error('bad data'), { code: '22023' }));
    let done: boolean | undefined;
    await act(async () => { done = await store!.toggleQuest('b1'); });
    expect(done).toBe(false);
    expect(shared.completeHabit).toHaveBeenCalledTimes(1);
  });

  it('still reports 22023 from an undo as a failure', async () => {
    await mount();
    shared.fetchTodayHabits.mockImplementation(async () => [{ ...basicQuest, completed: true }, countQuest, customQuest, legacyQuest]);
    await act(async () => { await store!.retryQuests(); });
    shared.kind.mockReturnValue('invalid-input');
    shared.undoCompletion.mockRejectedValue(Object.assign(new Error('bad'), { code: '22023' }));
    let done: boolean | undefined;
    await act(async () => { done = await store!.toggleQuest('b1'); });
    expect(done).toBe(false);
  });

  it('settles a delete retry that gets 42501 after its own earlier attempt, but not a first delete', async () => {
    await mount();
    shared.kind.mockReturnValue(null);
    shared.deleteHabit.mockRejectedValueOnce(new Error('Network down'));
    await expectRejects(() => store!.deleteQuest('b1'));
    shared.kind.mockReturnValue('denied');
    shared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await act(async () => { await store!.deleteQuest('b1'); });
    expect(shared.deleteHabit).toHaveBeenCalledTimes(2);
    await expectRejects(() => store!.saveHabit(basicInput, 'b1'), /deleted/);
    shared.deleteHabit.mockRejectedValueOnce(Object.assign(new Error('Tracker target unavailable.'), { code: '42501' }));
    await expectRejects(() => store!.deleteQuest('b2'));
  });

  it('reloads the lane and shows the refusal when a reorder is out of date', async () => {
    await mount();
    const before = shared.fetchTodayHabits.mock.calls.length;
    shared.kind.mockReturnValue('access-changed');
    shared.reorderQuests.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
    await expectRejects(() => store!.reorderQuests('habit', ['b2', 'b1']));
    await waitFor(() => expect(shared.fetchTodayHabits.mock.calls.length).toBeGreaterThan(before));
    expect(shared.reorderQuests).toHaveBeenCalledTimes(1);
  });
});

describe('age band for the optional-notice prompts', () => {
  const age = (over: Record<string, unknown> = {}) => ({
    userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, version: 1, ...over,
  });

  it('is teen when a birthday is present and adult is not declared', async () => {
    shared.fetchAccountAge.mockResolvedValue(age({ birthDate: '2012-01-01', adultDeclared: false }));
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(store?.audience).toBe('teen'));
  });

  it('is adult when a birthday is present and adult is declared', async () => {
    shared.fetchAccountAge.mockResolvedValue(age());
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(store?.audience).toBe('adult'));
  });

  it('is unknown (undefined) without a birthday', async () => {
    shared.fetchAccountAge.mockResolvedValue(age({ birthDate: null, adultDeclared: false }));
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(shared.fetchAccountAge).toHaveBeenCalled());
    expect(store?.audience).toBeUndefined();
  });

  it('stays unknown when the read fails, and the failure does not break the store', async () => {
    shared.fetchAccountAge.mockRejectedValue(new Error('down'));
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(shared.fetchAccountAge).toHaveBeenCalled());
    expect(store?.audience).toBeUndefined();
    expect(store?.tracker).toBeTruthy();
  });

  it('ignores a read that belongs to another account', async () => {
    shared.fetchAccountAge.mockResolvedValue(age({ userId: 'owner-b', birthDate: '2012-01-01', adultDeclared: false }));
    await mount({ customConsent: false, canWriteCustom: false });
    await waitFor(() => expect(shared.fetchAccountAge).toHaveBeenCalled());
    expect(store?.audience).toBeUndefined();
  });

  it('does no extra read when both optional purposes are already granted', async () => {
    shared.fetchAccountAge.mockResolvedValue(age());
    await mount();
    expect(shared.fetchAccountAge).not.toHaveBeenCalled();
    expect(store?.audience).toBeUndefined();
  });
});
