// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData, TrackerAccess } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({
  data: {} as GymData, access: null as unknown as TrackerAccess, kind: vi.fn(),
  fetchAccess: vi.fn(), age: vi.fn(), fetchGym: vi.fn(), history: vi.fn(), cleanup: vi.fn(), setConsent: vi.fn(),
  saveRoutine: vi.fn(), archive: vi.fn(), saveExercise: vi.fn(), removeExercise: vi.fn(), move: vi.fn(), deleteRoutine: vi.fn(),
  log: vi.fn(), upload: vi.fn(), sign: vi.fn(),
}));
vi.mock('@eiyu/shared', async importOriginal => {
  return {
    ...await importOriginal<object>(),
    fetchAccountAge: mocks.age, fetchTrackerAccess: mocks.fetchAccess, subscribeTrackerAccessChanges: () => () => undefined,
    setTrackerConsent: (...args: unknown[]) => mocks.setConsent(...args),
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
import { TRACKER_PURPOSE_NOTICES as NOTICES } from '@eiyu/shared';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:preview'); static revokeObjectURL = vi.fn(); });
  for (const fn of [mocks.kind, mocks.age, mocks.fetchAccess, mocks.fetchGym, mocks.history, mocks.cleanup, mocks.setConsent, mocks.saveRoutine, mocks.archive, mocks.saveExercise, mocks.removeExercise, mocks.move, mocks.deleteRoutine, mocks.log, mocks.upload, mocks.sign]) fn.mockReset();
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

function setup(access: TrackerAccess) {
  mocks.access = access;
  mocks.fetchAccess.mockImplementation(async () => mocks.access);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
const writeCalls = () => [mocks.saveRoutine, mocks.archive, mocks.saveExercise, mocks.removeExercise, mocks.move, mocks.deleteRoutine, mocks.log, mocks.upload, mocks.setConsent];

it('keeps history readable and read-only without fitness permission, with zero writes on mount', async () => {
  setup(noGrant());
  expect(await screen.findByRole('region', { name: 'Bench press details' })).toBeInTheDocument();
  expect(await screen.findByText(/read-only until you allow Gym tracking/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Workout history' })).toBeEnabled();
  for (const fn of writeCalls()) expect(fn).not.toHaveBeenCalled();
});

it('shows the Gym notice before any routine input, and declining returns to the page without saving', async () => {
  const user = userEvent.setup(); setup(noGrant());
  await screen.findByText(/read-only until you allow Gym tracking/i);
  await user.click(screen.getByRole('button', { name: 'Create routine' }));
  const dialog = await screen.findByRole('dialog', { name: 'Gym tracking permission' });
  expect(dialog).toHaveTextContent(NOTICES['fitness-tracking'].body);
  expect(screen.queryByRole('textbox', { name: /Routine name/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep history only' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Workout history' })).toBeInTheDocument();
  for (const fn of writeCalls()) expect(fn).not.toHaveBeenCalled();
});

it('does not log a weight, edit, or upload without permission', async () => {
  const user = userEvent.setup(); setup(noGrant());
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  expect(await screen.findByRole('dialog', { name: 'Gym tracking permission' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep history only' }));
  await user.click(screen.getByRole('button', { name: 'Exercise actions for Bench press' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit exercise' }));
  expect(await screen.findByRole('dialog', { name: 'Gym tracking permission' })).toBeInTheDocument();
  expect(screen.queryByLabelText(/Demonstration/)).not.toBeInTheDocument();
  for (const fn of writeCalls()) expect(fn).not.toHaveBeenCalled();
});

it('grants from the notice without silently running the action that opened it', async () => {
  const granted = trackerAccess({}, 'owner-a');
  mocks.setConsent.mockResolvedValue(granted);
  const user = userEvent.setup(); setup(noGrant());
  await screen.findByText(/read-only until you allow Gym tracking/i);
  await user.click(screen.getByRole('button', { name: 'Create routine' }));
  await user.click(await screen.findByRole('button', { name: NOTICES['fitness-tracking'].label }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gym tracking permission' })).not.toBeInTheDocument());
  expect(mocks.setConsent).toHaveBeenCalledWith('fitness-tracking', true, NOTICES['fitness-tracking'].version, noGrant().revision);
  expect(mocks.saveRoutine).not.toHaveBeenCalled();
  expect(screen.queryByText(/read-only until you allow Gym tracking/i)).not.toBeInTheDocument();
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

it('shows the paused wording and no usable grant when the account is under 12, with zero writes', async () => {
  const user = userEvent.setup(); setup({ ...noGrant(), canWriteBasic: false });
  await screen.findByText(/read-only until you allow Gym tracking/i);
  await user.click(screen.getByRole('button', { name: 'Create routine' }));
  const dialog = await screen.findByRole('dialog', { name: 'Gym tracking permission' });
  expect(dialog).toHaveTextContent(/paused for this account/i);
  expect(screen.getByRole('button', { name: NOTICES['fitness-tracking'].label })).toBeDisabled();
  for (const fn of writeCalls()) expect(fn).not.toHaveBeenCalled();
});

it('blocks the grant while authority for Gym is pending', async () => {
  const user = userEvent.setup(); setup({ ...noGrant(), fitnessAuthorityState: 'pending' });
  await screen.findByText(/read-only until you allow Gym tracking/i);
  await user.click(screen.getByRole('button', { name: 'Review Gym tracking' }));
  expect(await screen.findByText(/needs review before it can be turned on/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: NOTICES['fitness-tracking'].label })).toBeDisabled();
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it('says Gym permission could not be read, stays read-only and writes nothing when the read fails', async () => {
  const user = userEvent.setup();
  mocks.fetchAccess.mockRejectedValue(new Error('Tracker access unavailable.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  expect(await screen.findByText(/permission could not be read/i)).toBeInTheDocument();
  await user.type(await screen.findByRole('spinbutton'), '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  expect(await screen.findByRole('dialog', { name: 'Gym tracking permission' })).toHaveTextContent(/could not be read/i);
  for (const fn of writeCalls()) expect(fn).not.toHaveBeenCalled();
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

const ageOf = (over: Record<string, unknown> = {}) => ({ userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, version: 1, ...over });
const openNotice = async () => {
  const user = userEvent.setup(); setup(noGrant());
  await screen.findByText(/read-only until you allow Gym tracking/i);
  await user.click(screen.getByRole('button', { name: 'Create routine' }));
  return screen.findByRole('dialog', { name: 'Gym tracking permission' });
};

it('shows the 12-17 explanation in the Gym notice for a teen', async () => {
  mocks.age.mockResolvedValue(ageOf({ birthDate: '2012-01-01', adultDeclared: false }));
  const dialog = await openNotice();
  await waitFor(() => expect(dialog).toHaveTextContent(NOTICES['fitness-tracking'].childBody));
  expect(dialog).not.toHaveTextContent(NOTICES['fitness-tracking'].body);
});

it('keeps the adult Gym notice for an adult, an unknown age and a failed age read', async () => {
  for (const read of [() => mocks.age.mockResolvedValue(ageOf()), () => mocks.age.mockResolvedValue(ageOf({ birthDate: null })), () => mocks.age.mockRejectedValue(new Error('down'))]) {
    cleanup(); mocks.age.mockReset(); read();
    const dialog = await openNotice();
    await waitFor(() => expect(mocks.age).toHaveBeenCalled());
    expect(dialog).toHaveTextContent(NOTICES['fitness-tracking'].body);
    expect(dialog).not.toHaveTextContent(NOTICES['fitness-tracking'].childBody);
  }
});

it('does not read the age until the Gym notice is opened', async () => {
  setup(noGrant());
  await screen.findByText(/read-only until you allow Gym tracking/i);
  expect(mocks.age).not.toHaveBeenCalled();
});
