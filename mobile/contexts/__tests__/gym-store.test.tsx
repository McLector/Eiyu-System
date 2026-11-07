import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { UncertainSaveError, type GymExercise, type GymRoutine } from '@eiyu/shared';
import { Text } from 'react-native';
import { noGrant, resetTrackerMocks, createTrackerMocks, revisionOf, trackerAccess } from '@/test-support/tracker-fixtures';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockTracker = createTrackerMocks();
const mockShared = {
  ...mockTracker,
  fetchGym: jest.fn(),
  fetchRecentGymWeights: jest.fn(),
  logGymWeight: jest.fn(),
  moveGymExercises: jest.fn(),
  archiveGymRoutine: jest.fn(),
  deleteGymRoutine: jest.fn(),
  removeGymExercise: jest.fn(),
  listGymMediaCleanup: jest.fn(),
  acknowledgeGymMediaCleanup: jest.fn(),
  deleteGymMedia: jest.fn(),
};
jest.doMock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), ...mockShared }));
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }));

const { GymProvider, useGym } = require('../gym-store') as typeof import('../gym-store');
const { trackerKey } = require('@/contexts/tracker-access') as typeof import('@/contexts/tracker-access');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const routine = (over: Partial<GymRoutine> = {}): GymRoutine => ({ id: 'r1', user_id: 'user-1', name: 'Push', unit: 'kg', archived: false, created_at: '2026-10-01', ...over });
const exercise = (id: string, position: number, over: Partial<GymExercise> = {}): GymExercise => ({
  id, routine_id: 'r1', user_id: 'user-1', name: `Lift ${id}`, position, sets: 3, reps: '8', rest_seconds: 90, rir: 2, rir_max: null, notes: '', media_path: null, media_mime: null, ...over,
});
const recent = (id: string, weight: number, recency: 1 | 2, unit: 'kg' | 'lb' = 'kg') => ({ exercise_id: id, weight, unit, logged_at: '2026-10-01T00:00:00Z', recency });

let gym: ReturnType<typeof useGym> | null = null;
function Probe() {
  gym = useGym();
  return <Text>{gym.loading ? 'loading' : 'ready'}</Text>;
}
async function mount(data = { routines: [routine()], exercises: [exercise('e1', 0), exercise('e2', 1)] }, weights = [recent('e1', 60, 1), recent('e1', 55, 2)], waitForAccess = true) {
  mockShared.fetchGym.mockResolvedValue(data);
  mockShared.fetchRecentGymWeights.mockResolvedValue(weights);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><GymProvider><Probe /></GymProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('ready')).toBeOnTheScreen());
  if (data.routines.some(r => !r.deleted_at)) await waitFor(() => expect(gym!.logged('e1', 1)).not.toBeNull());
  if (waitForAccess) await waitFor(() => expect(gym!.tracker).toBeTruthy());
  return client;
}

beforeEach(() => {
  jest.resetAllMocks();
  resetTrackerMocks(mockTracker, 'user-1');
  mockShared.listGymMediaCleanup.mockResolvedValue([]);
  // The server's answer after a log: the typed weight is the newest, the old Current becomes Previous.
  mockShared.logGymWeight.mockImplementation(async (_id: string, _exercise: string, weight: number) => {
    mockShared.fetchRecentGymWeights.mockResolvedValue([recent('e1', weight, 1), recent('e1', 60, 2)]);
  });
  gym = null;
});
afterEach(async () => { await cleanup(); });

describe('gym store: reading', () => {
  it('selects the first routine and hides archived ones until asked', async () => {
    await mount({ routines: [routine({ id: 'r0', archived: true, name: 'Old' }), routine()], exercises: [exercise('e1', 0)] });
    expect(gym!.routine?.id).toBe('r1');
    expect(gym!.routines.map(r => r.id)).toEqual(['r1']);
    await act(async () => gym!.setShowArchived(true));
    expect(gym!.routines.map(r => r.id)).toEqual(['r0', 'r1']);
  });

  it('never lists a deleted routine, but still knows it for the history', async () => {
    await mount({ routines: [routine({ deleted_at: '2026-10-02' })], exercises: [] });
    expect(gym!.routine).toBeUndefined();
    expect(gym!.allRoutines.map(r => r.id)).toEqual(['r1']);
  });

  it('lists only the selected routine\'s exercises and reads Current and Previous in the routine unit', async () => {
    await mount(
      { routines: [routine({ unit: 'lb' })], exercises: [exercise('e1', 0), exercise('e2', 1, { routine_id: 'other' })] },
      [recent('e1', 100, 1, 'lb'), recent('e1', 50, 2, 'kg')],
    );
    expect(gym!.exercises.map(e => e.id)).toEqual(['e1']);
    expect(gym!.logged('e1', 1)).toBe(100);
    expect(gym!.logged('e1', 2)).toBe(110.231);
    expect(gym!.logged('e2', 1)).toBeNull();
  });
});

describe('gym store: logging a weight', () => {
  it('logs with a fresh uuid, makes it the new Current and the old one the Previous, and clears the draft', async () => {
    await mount();
    await act(async () => gym!.setDraft('e1', '62.5'));
    expect(gym!.dirty).toBe(true);
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    const [logId, exerciseId, weight, expected, targets] = mockShared.logGymWeight.mock.calls[0];
    expect(logId).toMatch(UUID);
    expect([exerciseId, weight, expected, targets]).toEqual(['e1', 62.5, revisionOf('user-1'), []]);
    expect(expected).not.toBe(gym!.tracker!.revision);
    expect(gym!.logged('e1', 1)).toBe(62.5);
    expect(gym!.logged('e1', 2)).toBe(60);
    expect(gym!.dirty).toBe(false);
    expect(gym!.notice).toBe('Lift e1: 62.5 kg logged.');
  });

  it('rejects an invalid weight with the reason and never calls the server', async () => {
    await mount();
    await act(async () => gym!.setDraft('e1', '12.3456'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(mockShared.logGymWeight).not.toHaveBeenCalled();
    expect(gym!.error).toMatch(/Weight must be a number/);
    await act(async () => gym!.setDraft('e1', 'abc'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(mockShared.logGymWeight).not.toHaveBeenCalled();
  });

  it('does nothing for an empty draft or the weight that is already Current', async () => {
    await mount();
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    await act(async () => gym!.setDraft('e1', '60'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(mockShared.logGymWeight).not.toHaveBeenCalled();
  });

  it('keeps the log id when the answer is uncertain, so confirming cannot record it twice', async () => {
    await mount();
    mockShared.logGymWeight.mockRejectedValueOnce(new UncertainSaveError());
    await act(async () => gym!.setDraft('e1', '70'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(gym!.uncertain).toBe(true);
    expect(gym!.draft('e1')).toBe('70');
    await act(async () => { await gym!.retryUncertain(); });
    expect(mockShared.logGymWeight).toHaveBeenCalledTimes(2);
    expect(mockShared.logGymWeight.mock.calls[1][0]).toBe(mockShared.logGymWeight.mock.calls[0][0]);
    expect(gym!.uncertain).toBe(false);
    expect(gym!.logged('e1', 1)).toBe(70);
  });

  it('shows a confirmed failure, keeps the draft and is not uncertain', async () => {
    await mount();
    mockShared.logGymWeight.mockRejectedValueOnce(new Error('permission denied'));
    await act(async () => gym!.setDraft('e1', '70'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(gym!.uncertain).toBe(false);
    expect(gym!.error).toMatch(/permission denied/);
    expect(gym!.draft('e1')).toBe('70');
  });

  it('keeps typed weights per exercise', async () => {
    await mount();
    await act(async () => { gym!.setDraft('e1', '1'); gym!.setDraft('e2', '2'); });
    expect([gym!.draft('e1'), gym!.draft('e2')]).toEqual(['1', '2']);
    expect(gym!.draft('e3')).toBe('');
    await act(async () => gym!.resetDrafts());
    expect(gym!.draft('e1')).toBe('60');
    expect(gym!.dirty).toBe(false);
  });
});

describe('gym store: exercises and routines', () => {
  it('moves an exercise by sending the whole new order, and ignores a move off either end', async () => {
    await mount();
    await act(async () => { await gym!.moveExercise(gym!.exercises[0], 1); });
    expect(mockShared.moveGymExercises).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), ['e2', 'e1'], revisionOf('user-1'), []);
    mockShared.moveGymExercises.mockClear();
    await act(async () => { await gym!.moveExercise(gym!.exercises[0], -1); });
    await act(async () => { await gym!.moveExercise(gym!.exercises[1], 1); });
    expect(mockShared.moveGymExercises).not.toHaveBeenCalled();
  });

  it('archives and restores the routine, and deletes it discarding a draft', async () => {
    await mount();
    await act(async () => { await gym!.archiveRoutine(); });
    expect(mockShared.archiveGymRoutine).toHaveBeenCalledWith('r1', true, revisionOf('user-1'), []);
    await act(async () => { await gym!.deleteRoutine(); });
    expect(mockShared.deleteGymRoutine).toHaveBeenCalledWith('r1', revisionOf('user-1'), [], true);
  });

  it('removes an exercise and then runs media cleanup', async () => {
    await mount();
    mockShared.listGymMediaCleanup.mockResolvedValueOnce([{ path: 'user-1/r1/a.gif' }]).mockResolvedValue([]);
    let removed: boolean | undefined;
    await act(async () => { removed = await gym!.removeExercise(gym!.exercises[0]); });
    expect(removed).toBe(true);
    expect(mockShared.removeGymExercise).toHaveBeenCalledWith('e1', revisionOf('user-1'), []);
    expect(mockShared.deleteGymMedia).toHaveBeenCalledWith('user-1/r1/a.gif');
    expect(mockShared.acknowledgeGymMediaCleanup).toHaveBeenCalledWith('user-1/r1/a.gif');
  });

  it('reports a removal that failed', async () => {
    await mount();
    mockShared.removeGymExercise.mockRejectedValueOnce(new Error('nope'));
    let removed: boolean | undefined;
    await act(async () => { removed = await gym!.removeExercise(gym!.exercises[0]); });
    expect(removed).toBe(false);
    expect(gym!.error).toMatch(/nope/);
  });

  it('turns a failed cleanup into a notice that offers the retry', async () => {
    await mount();
    mockShared.listGymMediaCleanup.mockRejectedValue(new Error('offline'));
    await act(async () => { await gym!.retryCleanup(); });
    expect(gym!.cleanupPending).toBe(true);
    expect(gym!.notice).toMatch(/cleanup/);
  });

  it('shows a confirmed failure from a routine action and an uncertain one can be confirmed again', async () => {
    await mount();
    mockShared.archiveGymRoutine.mockRejectedValueOnce(new UncertainSaveError());
    await act(async () => { await gym!.archiveRoutine(); });
    expect(gym!.uncertain).toBe(true);
    await act(async () => { await gym!.retryUncertain(); });
    expect(mockShared.archiveGymRoutine).toHaveBeenCalledTimes(2);
    expect(gym!.uncertain).toBe(false);
  });
});

describe('gym store: no permission layer', () => {
  const stale = () => Object.assign(new Error('stale'), { code: 'ET003' });
  const writes = () => [mockShared.logGymWeight, mockShared.archiveGymRoutine, mockShared.deleteGymRoutine, mockShared.removeGymExercise, mockShared.moveGymExercises];
  // A capability that says no to everything: Gym must not act on it, only the gateway may.
  const closed = () => trackerAccess({ customConsent: false, fitnessConsent: false, canWriteCustom: false, canWriteFitness: false, canWriteBasic: false }, 'user-1');

  it('logs, archives, deletes, removes and moves with no fitness permission, each with a copy of the loaded revision', async () => {
    resetTrackerMocks(mockTracker, 'user-1', noGrant('user-1'));
    await mount();
    await act(async () => gym!.setDraft('e1', '70'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    await act(async () => { await gym!.archiveRoutine(); });
    await act(async () => { await gym!.deleteRoutine(); });
    await act(async () => { await gym!.removeExercise(gym!.exercises[0]); });
    await act(async () => { await gym!.moveExercise(gym!.exercises[0], 1); });
    for (const fn of writes()) expect(fn).toHaveBeenCalledTimes(1);
    // The revision is the third argument of archive and the second of delete and remove.
    for (const [fn, at] of [[mockShared.archiveGymRoutine, 2], [mockShared.deleteGymRoutine, 1], [mockShared.removeGymExercise, 1]] as const) {
      expect(fn.mock.calls[0][at]).toEqual(revisionOf('user-1'));
      expect(fn.mock.calls[0][at]).not.toBe(gym!.tracker!.revision);
    }
    expect(gym!.error).toBeNull();
  });

  it('still sends when the capability is closed on every side: the gateway is the only judge', async () => {
    resetTrackerMocks(mockTracker, 'user-1', closed());
    await mount();
    await act(async () => { await gym!.archiveRoutine(); });
    expect(mockShared.archiveGymRoutine).toHaveBeenCalledTimes(1);
    expect(gym!.error).toBeNull();
  });

  it('exposes no fitness flag, prompt, age band or grant helper', async () => {
    await mount();
    for (const key of ['canWriteFitness', 'fitnessPrompt', 'setFitnessPrompt', 'audience', 'acceptTracker']) expect(gym).not.toHaveProperty(key);
    expect(gym!.tracker).toBeTruthy();
  });

  it('hands an editor a revision copy, or says access is unavailable when none was read', async () => {
    resetTrackerMocks(mockTracker, 'user-1', noGrant('user-1'));
    await mount();
    expect(gym!.requireFitness()).toBe(true);
    const captured = gym!.fitnessRevision();
    expect(captured).toEqual({ revision: revisionOf('user-1') });
    expect('revision' in captured && captured.revision).not.toBe(gym!.tracker!.revision);
  });

  it('never adopts another account capability, and says why nothing was sent', async () => {
    mockShared.fetchTrackerAccess.mockResolvedValue(trackerAccess({}, 'owner-b'));
    await mount(undefined, undefined, false);
    await act(async () => { await gym!.archiveRoutine(); });
    expect(gym!.tracker).toBeNull();
    expect(gym!.error).toBe('Tracker access unavailable.');
    expect(mockShared.archiveGymRoutine).not.toHaveBeenCalled();
    expect(gym!.requireFitness()).toBe(false);
    expect(gym!.fitnessRevision()).toEqual({ denied: 'Tracker access unavailable.' });
  });

  it('refuses while access cannot be read, shows the message and sends nothing', async () => {
    mockShared.fetchTrackerAccess.mockRejectedValue(new Error('down'));
    await mount(undefined, undefined, false);
    await waitFor(() => expect(gym!.trackerSettled).toBe(true));
    await act(async () => gym!.setDraft('e1', '70'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    await act(async () => { await gym!.archiveRoutine(); });
    expect(gym!.error).toBe('Tracker access unavailable.');
    for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
    expect(gym!.draft('e1')).toBe('70');
  });

  it('keeps one revision across an uncertain retry even when access changed meanwhile', async () => {
    const client = await mount();
    mockShared.archiveGymRoutine.mockRejectedValueOnce(new UncertainSaveError());
    await act(async () => { await gym!.archiveRoutine(); });
    await act(async () => { client.setQueryData(trackerKey('user-1'), { ...trackerAccess({}, 'user-1'), revision: { ...revisionOf('user-1'), consentVersion: 9 } }); });
    await act(async () => { await gym!.retryUncertain(); });
    expect(mockShared.archiveGymRoutine.mock.calls[1][2]).toEqual(revisionOf('user-1'));
  });

  it('on a stale refusal shows the reason, re-reads access and does not retry', async () => {
    await mount();
    const before = mockShared.fetchTrackerAccess.mock.calls.length;
    mockShared.logGymWeight.mockRejectedValueOnce(stale());
    await act(async () => gym!.setDraft('e1', '70'));
    await act(async () => { await gym!.logWeight(gym!.exercises[0]); });
    expect(gym!.error).toMatch(/permissions or this record changed/i);
    expect(gym!.uncertain).toBe(false);
    await waitFor(() => expect(mockShared.fetchTrackerAccess.mock.calls.length).toBeGreaterThan(before));
    expect(mockShared.logGymWeight).toHaveBeenCalledTimes(1);
  });

  it('words a gateway refusal as a plain reload message', async () => {
    await mount();
    mockShared.archiveGymRoutine.mockRejectedValueOnce(Object.assign(new Error('purpose'), { code: 'ET002' }));
    await act(async () => { await gym!.archiveRoutine(); });
    expect(gym!.error).toMatch(/Reload and try again/);
    expect(gym!.error).not.toMatch(/permission|Edit details|Gym tracking/i);
  });
});
