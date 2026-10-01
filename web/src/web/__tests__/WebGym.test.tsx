// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';
const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), start: vi.fn(), save: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({ ...await importOriginal<object>(), fetchGym: mocks.fetchGym, startGymSession: mocks.start, saveGymSession: mocks.save }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import { validateGymMedia } from '../gym-media';
afterEach(cleanup);
beforeEach(() => {
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Chest–Tricep–Shoulders', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }], sessions: [], entries: [],
  };
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
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
  const router = createMemoryRouter([{ path: '/gym', element: <WebGym /> }], { initialEntries: ['/gym'] });
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
