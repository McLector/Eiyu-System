// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';
import { UncertainSaveError } from '@eiyu/shared';
const mocks = vi.hoisted(() => ({ data: {} as GymData, logs: [] as { exercise_id: string; weight: number; unit: 'kg' | 'lb' }[], fetchGym: vi.fn(), log: vi.fn(), history: vi.fn(), saveExercise: vi.fn(), upload: vi.fn(), removeMedia: vi.fn(), sign: vi.fn(), cleanup: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({ ...await importOriginal<object>(), fetchGym: mocks.fetchGym, logGymWeight: mocks.log, saveGymExercise: mocks.saveExercise, fetchGymHistory: mocks.history, fetchRecentGymWeights: async () => { const out: unknown[] = []; for (const id of new Set(mocks.logs.map(l => l.exercise_id))) mocks.logs.filter(l => l.exercise_id === id).reverse().slice(0, 2).forEach((l, i) => out.push({ exercise_id: id, weight: l.weight, unit: l.unit, logged_at: '2026-10-01T00:00:00Z', recency: i + 1 })); return out; }, listGymMediaCleanup: mocks.cleanup }));
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
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }],
  };
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
  mocks.history.mockReset().mockResolvedValue({ sessions: [], entries: [], hasNext: false });
  mocks.logs = [];
  mocks.log.mockReset().mockImplementation(async (_id: string, exerciseId: string, weight: number) => { mocks.logs.push({ exercise_id: exerciseId, weight, unit: 'kg' }); });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /><ArchiveNotice onOpen={vi.fn()} /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
it('logs a weight, confirms it, and carries it into Previous on the next log', async () => {
  const user = userEvent.setup(); setup();
  const weight = await screen.findByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
  await user.type(weight, '40');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  await screen.findByText('Bench press: 40 kg logged.');
  expect(mocks.log).toHaveBeenCalledWith(expect.any(String), 'bench', 40);
  await waitFor(() => expect(weight).toHaveValue(40));
  await user.clear(weight); await user.type(weight, '42.5');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
  await screen.findByText('Bench press: 42.5 kg logged.');
  expect(await screen.findByText('40 kg')).toBeInTheDocument();
  expect(weight).toHaveValue(42.5);
});
it('names each destructive confirmation after the action it performs, not a generic "Confirm"', async () => {
  const user = userEvent.setup(); setup();
  for (const [menu, opener, title] of [['Routine actions for Chest–Tricep–Shoulders', 'Delete routine', 'Delete routine'], ['Exercise actions for Bench press', 'Remove Bench press', 'Remove exercise']] as const) {
    await user.click(await screen.findByRole('button', { name: menu }));
    await user.click(screen.getByRole('menuitem', { name: opener }));
    const dialog = await screen.findByRole('dialog', { name: title });
    expect(within(dialog).getByRole('button', { name: title })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Confirm' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  }
});
it('shows an empty video guide and keeps a failed log editable', async () => {
  const user = userEvent.setup(); setup();
  expect(await screen.findByRole('region', { name: 'Bench press details' })).toHaveTextContent('No video guide attached.');
  mocks.log.mockRejectedValueOnce(new Error('Network unavailable'));
  await user.type(await screen.findByRole('spinbutton'), '0');
  await user.click(screen.getByRole('button', { name: 'Log weight for Bench press' }));
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
  expect(await screen.findByRole('alert')).toHaveTextContent('Your upload is held until the save is confirmed.');
  expect(screen.getByRole('textbox', { name: 'Exercise name' })).toBeDisabled();
  expect(screen.getByLabelText(/Demonstration \(optional/)).toBeDisabled();
  expect(mocks.removeMedia).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Close Add exercise' }));
  expect(screen.getByRole('dialog', { name: 'Save in progress' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(screen.getByRole('button', { name: 'Confirm save result' }));
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
  await user.click(await screen.findByRole('button', { name: 'Exercise actions for Bench press' }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit exercise' }));
  await user.upload(screen.getByLabelText(/Demonstration \(optional/), new File(['GIF89a'], 'new.gif', { type: 'image/gif' }));
  await user.click(screen.getByRole('button', { name: 'Save exercise' }));
  await waitFor(() => expect(mocks.saveExercise).toHaveBeenCalledOnce());
  expect(mocks.removeMedia).not.toHaveBeenCalled();
  await act(async () => resolve('bench'));
  await waitFor(() => expect(mocks.removeMedia).toHaveBeenCalledWith('owner/routine/previous.gif'));
});

it('shows the video guide inline without autoplay and renews signed access', async () => {
  mocks.data.exercises[0].media_path = 'owner/routine/demo.mp4';
  mocks.data.exercises[0].media_mime = 'video/mp4';
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const interval = vi.spyOn(window, 'setInterval');
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  await waitFor(() => expect(detail.querySelector('video.gym-media')).toHaveAttribute('src', 'https://example.invalid/private-demo.mp4'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(play).not.toHaveBeenCalled();
  const renewal = interval.mock.calls.find(call => call[1] === 240000)![0] as () => void;
  await act(async () => renewal());
  expect(mocks.sign).toHaveBeenCalledTimes(2);
});

it('reports a failed video guide and reloads it on request', async () => {
  mocks.data.exercises[0].media_path = 'owner/routine/demo.mp4';
  mocks.data.exercises[0].media_mime = 'video/mp4';
  mocks.sign.mockRejectedValueOnce(new Error('Signed access expired'));
  const user = userEvent.setup(); setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(await within(detail).findByRole('alert')).toHaveTextContent('Signed access expired');
  expect(detail.querySelector('video')).toBeNull();
  await user.click(within(detail).getByRole('button', { name: 'Reload video guide' }));
  await waitFor(() => expect(detail.querySelector('video.gym-media')).not.toBeNull());
  expect(mocks.sign).toHaveBeenCalledTimes(2);
});
