// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';
import { UncertainSaveError } from '@eiyu/shared';
const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), start: vi.fn(), save: vi.fn(), previous: vi.fn(), history: vi.fn(), saveExercise: vi.fn(), upload: vi.fn(), removeMedia: vi.fn(), sign: vi.fn(), cleanup: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({ ...await importOriginal<object>(), fetchGym: mocks.fetchGym, startGymSession: mocks.start, saveGymSession: mocks.save, saveGymExercise: mocks.saveExercise, fetchPreviousGymWeights: mocks.previous, fetchGymHistory: mocks.history, listGymMediaCleanup: mocks.cleanup }));
vi.mock('../gym-media', async importOriginal => ({ ...await importOriginal<object>(), uploadGymMedia: mocks.upload, deleteGymMedia: mocks.removeMedia, signGymMedia: mocks.sign }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import ArchiveNotice from '../../components/ArchiveNotice';
import { validateGymMedia } from '../gym-media';
import { NavigationGuard } from '../../components/NavigationGuard';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:preview'); static revokeObjectURL = vi.fn(); });
  mocks.saveExercise.mockReset().mockResolvedValue('persisted-exercise');
  mocks.upload.mockReset().mockResolvedValue({ path: 'owner/routine/upload.gif', mime: 'image/gif' });
  mocks.removeMedia.mockReset().mockResolvedValue(undefined);
  mocks.sign.mockReset().mockResolvedValue('https://example.invalid/private-demo.mp4');
  mocks.cleanup.mockReset().mockResolvedValue([]);
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Chest–Tricep–Shoulders', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }], sessions: [], entries: [],
  };
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
  mocks.previous.mockReset().mockImplementation(async () => mocks.data.exercises.flatMap(exercise => {
    const session = mocks.data.sessions.find(s => s.status === 'completed' && mocks.data.entries.some(e => e.session_id === s.id && e.exercise_id === exercise.id && e.weight !== null));
    const entry = mocks.data.entries.find(e => e.session_id === session?.id && e.exercise_id === exercise.id);
    return entry && session ? [{ exercise_id: exercise.id, weight: entry.weight, unit: session.unit, completed_at: session.completed_at }] : [];
  }));
  mocks.history.mockReset().mockImplementation(async () => ({ sessions: mocks.data.sessions.filter(s => s.status === 'completed'), entries: mocks.data.entries, hasNext: false }));
  mocks.start.mockReset().mockImplementation(async () => {
    const id = `session-${mocks.data.sessions.length}`;
    mocks.data.sessions.unshift({ id, routine_id: 'routine', user_id: 'owner', routine_name: 'Chest–Tricep–Shoulders', unit: 'kg', status: 'draft', created_at: '2026-10-01', completed_at: null });
    mocks.data.entries.push({ id: `entry-${id}`, session_id: id, user_id: 'owner', exercise_id: 'bench', position: 0, prescription: { name: 'Bench press', sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '' }, weight: null });
    return id;
  });
  mocks.save.mockReset().mockImplementation(async (id, weights, finish) => {
    mocks.data.entries.find(e => e.session_id === id)!.weight = weights[0].weight;
    if (finish) { const session = mocks.data.sessions.find(s => s.id === id)!; session.status = 'completed'; session.completed_at = '2026-10-01T08:00:00Z'; }
  });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /><ArchiveNotice onOpen={vi.fn()} /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
it('finishes a workout and carries its weight into the next session', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  const weight = await screen.findByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
  await waitFor(() => expect(weight).toBeEnabled());
  await user.type(weight, '40');
  await user.click(screen.getByRole('button', { name: 'Finish workout' }));
  await screen.findByText('Workout completed. Progress saved.');
  expect(mocks.save).toHaveBeenCalledWith('session-0', [{ exercise_id: 'bench', weight: 40 }], true);
  await user.click(screen.getByRole('button', { name: 'Start workout' }));
  expect(await screen.findByText('40 kg')).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Current weight for Bench press in kg' })).toHaveValue(null);
});
it('shows an empty demonstration and keeps a failed save editable', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Bench press' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('No demonstration uploaded');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Start workout' }));
  await waitFor(() => expect(screen.getByRole('spinbutton')).toBeEnabled());
  mocks.save.mockRejectedValueOnce(new Error('Network unavailable'));
  await user.type(screen.getByRole('spinbutton'), '0');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getByRole('spinbutton')).toHaveValue(0);
});
it('rejects unsupported and oversized media before upload', async () => {
  await expect(validateGymMedia(new File(['text'], 'bad.txt', { type: 'text/plain' }))).rejects.toThrow('GIF or MP4');
  const file = new File(['gif'], 'big.gif', { type: 'image/gif' });
  Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });
  await expect(validateGymMedia(file)).rejects.toThrow('20 MiB');
});

it('retains one upload and freezes the payload until an uncertain exercise creation is reconciled', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Add exercise' }));
  await user.type(screen.getByRole('textbox', { name: 'Exercise name' }), 'Rows');
  await user.upload(screen.getByLabelText(/Demonstration \(optional/), new File(['GIF89a'], 'rows.gif', { type: 'image/gif' }));
  mocks.saveExercise.mockRejectedValueOnce(new UncertainSaveError());
  await user.click(screen.getByRole('button', { name: 'Save exercise' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Uploaded media retained');
  expect(screen.getByRole('textbox', { name: 'Exercise name' })).toBeDisabled();
  expect(screen.getByLabelText(/Demonstration \(optional/)).toBeDisabled();
  expect(mocks.removeMedia).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Close Add exercise' }));
  expect(screen.getByRole('dialog', { name: 'Save in progress' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(screen.getByRole('button', { name: 'Check save result' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.saveExercise).toHaveBeenCalledTimes(2);
  expect(mocks.saveExercise.mock.calls[0][0]).toEqual(mocks.saveExercise.mock.calls[1][0]);
  expect(mocks.removeMedia).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

it('revokes local previews on replacement and confirmed editor dismissal', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Add exercise' }));
  const upload = screen.getByLabelText(/Demonstration \(optional/);
  await user.upload(upload, new File(['GIF89a'], 'one.gif', { type: 'image/gif' }));
  await user.upload(upload, new File(['GIF89a'], 'two.gif', { type: 'image/gif' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('cleans replaced media only after a confirmed exercise save', async () => {
  mocks.data.exercises[0].media_path = 'owner/routine/previous.gif';
  mocks.data.exercises[0].media_mime = 'image/gif';
  let resolve!: (value: string) => void;
  mocks.saveExercise.mockImplementationOnce(() => new Promise<string>(r => { resolve = r; }));
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: /^Edit$/ }));
  await user.upload(screen.getByLabelText(/Demonstration \(optional/), new File(['GIF89a'], 'new.gif', { type: 'image/gif' }));
  await user.click(screen.getByRole('button', { name: 'Save exercise' }));
  await waitFor(() => expect(mocks.saveExercise).toHaveBeenCalledOnce());
  expect(mocks.removeMedia).not.toHaveBeenCalled();
  await act(async () => resolve('bench'));
  await waitFor(() => expect(mocks.removeMedia).toHaveBeenCalledWith('owner/routine/previous.gif'));
});

it('offers a Play fallback after autoplay rejection and renews signed access', async () => {
  mocks.data.exercises[0].media_path = 'owner/routine/demo.mp4';
  mocks.data.exercises[0].media_mime = 'video/mp4';
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('Autoplay blocked')).mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const interval = vi.spyOn(window, 'setInterval');
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Bench press' }));
  await user.click(await screen.findByRole('button', { name: 'Play demonstration' }));
  expect(play).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: 'Play demonstration' })).not.toBeInTheDocument();
  const renewal = interval.mock.calls.find(call => call[1] === 240000)![0] as () => void;
  await act(async () => renewal());
  expect(mocks.sign).toHaveBeenCalledTimes(2);
  await user.keyboard('{Escape}');
  expect(pause).toHaveBeenCalled();
});
