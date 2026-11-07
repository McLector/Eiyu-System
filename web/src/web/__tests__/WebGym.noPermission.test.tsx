// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData, TrackerAccess } from '@eiyu/shared';

// Gym asks for nothing: the mock has no setTrackerConsent and no fetchAccountAge, so any call to either would throw.
const mocks = vi.hoisted(() => ({
  data: {} as GymData, access: null as unknown as TrackerAccess, kind: vi.fn(),
  fetchAccess: vi.fn(), fetchGym: vi.fn(), history: vi.fn(), cleanup: vi.fn(),
  saveRoutine: vi.fn(), archive: vi.fn(), saveExercise: vi.fn(), removeExercise: vi.fn(), move: vi.fn(), deleteRoutine: vi.fn(),
  log: vi.fn(), upload: vi.fn(), sign: vi.fn(),
}));
vi.mock('@eiyu/shared', async importOriginal => {
  return {
    ...await importOriginal<object>(),
    fetchTrackerAccess: mocks.fetchAccess, subscribeTrackerAccessChanges: () => () => undefined,
    trackerErrorKind: (error: unknown) => mocks.kind(error),
    fetchGym: mocks.fetchGym, fetchGymHistory: mocks.history, listGymMediaCleanup: mocks.cleanup,
    fetchRecentGymWeights: async () => [],
    saveGymRoutine: mocks.saveRoutine, archiveGymRoutine: mocks.archive, saveGymExercise: mocks.saveExercise,
    removeGymExercise: mocks.removeExercise, moveGymExercises: mocks.move, deleteGymRoutine: mocks.deleteRoutine, logGymWeight: mocks.log,
  };
});
vi.mock('../gym-media', async importOriginal => ({ ...await importOriginal<object>(), uploadGymMedia: mocks.upload, signGymMedia: mocks.sign, deleteGymMedia: vi.fn() }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner-a' } }) }));

import WebGym from '../WebGym';
import { NavigationGuard } from '../../components/NavigationGuard';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:preview'); static revokeObjectURL = vi.fn(); });
  for (const fn of [mocks.kind, mocks.fetchAccess, mocks.fetchGym, mocks.history, mocks.cleanup, mocks.saveRoutine, mocks.archive, mocks.saveExercise, mocks.removeExercise, mocks.move, mocks.deleteRoutine, mocks.log, mocks.upload, mocks.sign]) fn.mockReset();
  mocks.kind.mockReturnValue(null);
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner-a', name: 'Push day', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner-a', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }],
  } as GymData;
  mocks.fetchGym.mockImplementation(async () => structuredClone(mocks.data));
  mocks.history.mockResolvedValue({ sessions: [], entries: [], hasNext: false });
  mocks.cleanup.mockResolvedValue([]);
  mocks.sign.mockResolvedValue('https://example.invalid/x.mp4');
  mocks.saveRoutine.mockResolvedValue('routine'); mocks.archive.mockResolvedValue(undefined); mocks.saveExercise.mockResolvedValue('bench');
  mocks.log.mockResolvedValue(undefined); mocks.upload.mockResolvedValue({ path: 'owner-a/routine/1-1-0/u.gif', mime: 'image/gif' });
});

function mountGym() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
function setup(access: TrackerAccess) {
  mocks.access = access;
  mocks.fetchAccess.mockImplementation(async () => mocks.access);
  mountGym();
}
const oldWording = /permission|Keep history|read-only until|Review Gym tracking|allow Gym tracking/i;

it('shows no permission, history-only or review wording even when every fitness flag is off', async () => {
  setup(noGrant());
  expect(await screen.findByRole('region', { name: 'Bench press details' })).toBeInTheDocument();
  await waitFor(() => expect(mocks.fetchAccess).toHaveBeenCalled());
  expect(screen.queryByText(oldWording)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Review Gym tracking/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('opens the routine form straight away for a person with no fitness permission', async () => {
  const user = userEvent.setup(); const access = noGrant(); setup(access);
  await user.click(await screen.findByRole('button', { name: 'Create routine' }));
  expect(screen.queryByRole('dialog', { name: 'Gym tracking permission' })).not.toBeInTheDocument();
  await user.type(await screen.findByRole('textbox', { name: /Routine name/ }), 'Legs');
  await user.click(screen.getByRole('button', { name: 'Save routine' }));
  await waitFor(() => expect(mocks.saveRoutine).toHaveBeenCalledWith('owner-a', 'Legs', 'kg', access.revision, [], undefined, expect.any(String)));
});

it('logs a set for a person with no fitness permission, with no prompt', async () => {
  const user = userEvent.setup(); const access = noGrant(); setup(access);
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  await waitFor(() => expect(mocks.log).toHaveBeenCalledOnce());
  expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 40, access.revision, []);
  expect(screen.queryByRole('dialog', { name: 'Gym tracking permission' })).not.toBeInTheDocument();
});

it('opens the exercise form for a person with no fitness permission', async () => {
  const user = userEvent.setup(); setup(noGrant());
  await user.click(await screen.findByRole('button', { name: 'Exercise actions for Bench press' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit exercise' }));
  expect(await screen.findByLabelText(/Demonstration \(optional/)).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Gym tracking permission' })).not.toBeInTheDocument();
});

it('logs a weight with a copy of the captured revision and no targets', async () => {
  const user = userEvent.setup(); const access = trackerAccess({}, 'owner-a'); setup(access);
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  await waitFor(() => expect(mocks.log).toHaveBeenCalledOnce());
  expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 40, access.revision, []);
  expect(mocks.log.mock.calls[0][3]).not.toBe(access.revision);
});

it('archives and saves a routine with the captured revision', async () => {
  const user = userEvent.setup(); const access = trackerAccess({}, 'owner-a'); setup(access);
  await user.click(await screen.findByRole('button', { name: 'Routine actions for Push day' }));
  await user.click(screen.getByRole('menuitem', { name: 'Archive routine' }));
  await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith('routine', true, access.revision, []));
  await user.click(await screen.findByRole('button', { name: 'Create routine' }));
  await user.type(screen.getByRole('textbox', { name: /Routine name/ }), 'Legs');
  await user.click(screen.getByRole('button', { name: 'Save routine' }));
  await waitFor(() => expect(mocks.saveRoutine).toHaveBeenCalledWith('owner-a', 'Legs', 'kg', access.revision, [], undefined, expect.any(String)));
});

it('uploads and saves an exercise with the same revision, and never retries a stale save', async () => {
  const user = userEvent.setup(); const access = trackerAccess({}, 'owner-a'); setup(access);
  await user.click(await screen.findByRole('button', { name: 'Exercise actions for Bench press' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit exercise' }));
  const file = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
  await user.upload(await screen.findByLabelText(/Demonstration \(optional/), file);
  mocks.kind.mockReturnValue('access-changed');
  mocks.saveExercise.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
  const reads = mocks.fetchAccess.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Save exercise' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/permissions or this record changed/i);
  await waitFor(() => expect(alert).toHaveFocus());
  expect(mocks.upload).toHaveBeenCalledWith('owner-a', 'routine', file, access.revision);
  expect(mocks.saveExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'bench' }), access.revision, []);
  expect(mocks.saveExercise).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(mocks.fetchAccess.mock.calls.length).toBeGreaterThan(reads));
});

it('refreshes access and does not retry when a weight log is refused as stale', async () => {
  const user = userEvent.setup(); setup(trackerAccess({}, 'owner-a'));
  mocks.kind.mockReturnValue('access-changed');
  mocks.log.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
  await user.type(await screen.findByRole('spinbutton'), '40');
  const reads = mocks.fetchAccess.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/permissions or this record changed/i);
  await waitFor(() => expect(mocks.fetchAccess.mock.calls.length).toBeGreaterThan(reads));
  expect(mocks.log).toHaveBeenCalledTimes(1);
});

it('sends the write when the flags say paused, and shows the gateway refusal instead of deciding itself', async () => {
  const user = userEvent.setup(); setup({ ...noGrant(), canWriteBasic: false });
  mocks.kind.mockReturnValue('under12-paused');
  mocks.log.mockRejectedValue(Object.assign(new Error('paused'), { code: 'ET001' }));
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/paused for this account/i);
  expect(mocks.log).toHaveBeenCalledTimes(1);
});

it('keeps history readable, says Gym could not check the account and writes nothing when the read fails', async () => {
  const user = userEvent.setup();
  mocks.fetchAccess.mockRejectedValue(new Error('Tracker access unavailable.'));
  mountGym();
  expect(await screen.findByText(/could not check your account/i)).toBeInTheDocument();
  expect(screen.queryByText(oldWording)).not.toBeInTheDocument();
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tracker access unavailable.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  for (const fn of [mocks.saveRoutine, mocks.archive, mocks.saveExercise, mocks.removeExercise, mocks.move, mocks.deleteRoutine, mocks.log, mocks.upload]) expect(fn).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Workout history' })).toBeEnabled();
});
