import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { UncertainSaveError, type GymExercise, type GymRoutine } from '@eiyu/shared';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = {
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
async function mount(data = { routines: [routine()], exercises: [exercise('e1', 0), exercise('e2', 1)] }, weights = [recent('e1', 60, 1), recent('e1', 55, 2)]) {
  mockShared.fetchGym.mockResolvedValue(data);
  mockShared.fetchRecentGymWeights.mockResolvedValue(weights);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><GymProvider><Probe /></GymProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('ready')).toBeOnTheScreen());
  if (data.routines.some(r => !r.deleted_at)) await waitFor(() => expect(gym!.logged('e1', 1)).not.toBeNull());
  return client;
}

beforeEach(() => {
  jest.resetAllMocks();
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

  it('never lists a deleted routine', async () => {
    await mount({ routines: [routine({ deleted_at: '2026-10-02' })], exercises: [] });
    expect(gym!.routine).toBeUndefined();
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
    const [logId, exerciseId, weight] = mockShared.logGymWeight.mock.calls[0];
    expect(logId).toMatch(UUID);
    expect([exerciseId, weight]).toEqual(['e1', 62.5]);
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
    expect(mockShared.moveGymExercises).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), ['e2', 'e1']);
    mockShared.moveGymExercises.mockClear();
    await act(async () => { await gym!.moveExercise(gym!.exercises[0], -1); });
    await act(async () => { await gym!.moveExercise(gym!.exercises[1], 1); });
    expect(mockShared.moveGymExercises).not.toHaveBeenCalled();
  });

  it('archives and restores the routine, and deletes it discarding a draft', async () => {
    await mount();
    await act(async () => { await gym!.archiveRoutine(); });
    expect(mockShared.archiveGymRoutine).toHaveBeenCalledWith('r1', true);
    await act(async () => { await gym!.deleteRoutine(); });
    expect(mockShared.deleteGymRoutine).toHaveBeenCalledWith('r1', true);
  });

  it('removes an exercise and then runs media cleanup', async () => {
    await mount();
    mockShared.listGymMediaCleanup.mockResolvedValueOnce([{ path: 'user-1/r1/a.gif' }]).mockResolvedValue([]);
    await act(async () => { await gym!.removeExercise(gym!.exercises[0]); });
    expect(mockShared.removeGymExercise).toHaveBeenCalledWith('e1');
    expect(mockShared.deleteGymMedia).toHaveBeenCalledWith('user-1/r1/a.gif');
    expect(mockShared.acknowledgeGymMediaCleanup).toHaveBeenCalledWith('user-1/r1/a.gif');
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
