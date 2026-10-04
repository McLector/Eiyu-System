// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), start: vi.fn(), previous: vi.fn(), cleanup: vi.fn(), sign: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(), fetchGym: mocks.fetchGym, startGymSession: mocks.start,
  fetchPreviousGymWeights: mocks.previous, listGymMediaCleanup: mocks.cleanup,
}));
vi.mock('../gym-media', async importOriginal => ({ ...await importOriginal<object>(), signGymMedia: mocks.sign }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const exercise = (id: string, name: string, position: number, media = false) => ({
  id, routine_id: 'routine', user_id: 'owner', name, position, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, rir_max: null,
  notes: name === 'Squat' ? 'Brace before the descent.' : '', media_path: media ? 'owner/routine/squat.mp4' : null, media_mime: media ? 'video/mp4' : null,
});
beforeEach(() => {
  mocks.cleanup.mockReset().mockResolvedValue([]);
  mocks.previous.mockReset().mockResolvedValue([]);
  mocks.sign.mockReset().mockResolvedValue('https://example.invalid/squat.mp4');
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Leg day', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [exercise('bench', 'Bench press', 0), exercise('squat', 'Squat', 1, true)],
    sessions: [], entries: [],
  } as unknown as GymData;
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
  mocks.start.mockReset().mockImplementation(async () => {
    mocks.data.sessions.unshift({ id: 's0', routine_id: 'routine', user_id: 'owner', routine_name: 'Leg day', unit: 'kg', status: 'draft', created_at: '2026-10-01', completed_at: null } as never);
    for (const e of mocks.data.exercises) mocks.data.entries.push({ id: `e-${e.id}`, session_id: 's0', user_id: 'owner', exercise_id: e.id, position: e.position, prescription: { name: e.name, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: e.notes }, weight: null } as never);
    return 's0';
  });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(await screen.findByRole('button', { name: new RegExp(`^\\d+\\s*${name}`) }));

it('lists the exercises and shows the first one in the detail pane', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(within(detail).getByText('3 × 8-12')).toBeInTheDocument();
  expect(within(detail).getByText('90s')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^\d+\s*(Bench press|Squat)/ })).toHaveLength(2);
});

it('shows the selected exercise, its notes and its video guide', async () => {
  const user = userEvent.setup(); setup();
  await pick(user, 'Squat');
  const detail = await screen.findByRole('region', { name: 'Squat details' });
  expect(within(detail).getByText('Brace before the descent.')).toBeInTheDocument();
  await waitFor(() => expect(detail.querySelector('video.gym-media')).not.toBeNull());
  const video = detail.querySelector('video.gym-media') as HTMLVideoElement;
  expect(video).toHaveAttribute('controls');
  expect(video.muted).toBe(true);
  expect(video).not.toHaveAttribute('autoplay');
  expect(mocks.sign).toHaveBeenCalledWith('owner/routine/squat.mp4');
});

it('says when an exercise has no video guide and offers to attach one', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  expect(within(detail).getByText('No video guide attached.')).toBeInTheDocument();
  expect(within(detail).getByRole('button', { name: 'Attach a video guide' })).toBeEnabled();
});

it('puts the routine and exercise actions in menus', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Routine actions for Leg day' }));
  expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Edit routine', 'Archive routine', 'Delete routine']);
  await user.keyboard('{Escape}');
  await user.click(await screen.findByRole('button', { name: 'Exercise actions for Bench press' }));
  expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.getAttribute('aria-label') ?? i.textContent)).toEqual(['Edit exercise', 'Move Bench press up', 'Move Bench press down', 'Remove Bench press']);
  expect(screen.getByRole('menuitem', { name: 'Move Bench press up' })).toBeDisabled();
});

it('shows one draft chip in the heading and keeps the session actions in the footer', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  const chip = await screen.findByText(/Workout draft · kg/, { selector: '.quest-chip' });
  expect(chip.closest('.gym-routine-heading')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Exercise actions for Bench press' })).toBeDisabled();
});

it('keeps typed weights per exercise while switching between them', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  const bench = await screen.findByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
  await waitFor(() => expect(bench).toBeEnabled());
  await user.type(bench, '40');
  await pick(user, 'Squat');
  expect(await screen.findByRole('spinbutton', { name: 'Current weight for Squat in kg' })).toHaveValue(null);
  await pick(user, 'Bench press');
  expect(await screen.findByRole('spinbutton', { name: 'Current weight for Bench press in kg' })).toHaveValue(40);
});

it('jumps to and focuses the first blank weight from "Review fields"', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  const bench = await screen.findByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
  await waitFor(() => expect(bench).toBeEnabled());
  await user.type(bench, '40');
  await user.click(screen.getByRole('button', { name: 'Finish workout' }));
  await user.click(await screen.findByRole('button', { name: 'Review fields' }));
  const squat = await screen.findByRole('spinbutton', { name: 'Current weight for Squat in kg' });
  await waitFor(() => expect(squat).toHaveFocus());
});

it('pages the list to a blank weight beyond the first page and focuses it from "Review fields"', async () => {
  mocks.data.exercises = ['Bench press', 'Squat', 'Row', 'Press', 'Curl', 'Calf raise'].map((name, index) => exercise(`x${index}`, name, index)) as unknown as GymData['exercises'];
  const user = userEvent.setup({ delay: null }); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Current weight for Bench press in kg' })).toBeEnabled());
  for (const name of ['Bench press', 'Squat', 'Row', 'Press', 'Curl']) {
    await pick(user, name);
    await user.type(await screen.findByRole('spinbutton', { name: `Current weight for ${name} in kg` }), '1');
  }
  expect(screen.queryByRole('button', { name: /^\d+\s*Calf raise/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Finish workout' }));
  await user.click(await screen.findByRole('button', { name: 'Review fields' }));
  const item = await screen.findByRole('button', { name: /^\d+\s*Calf raise/ });
  expect(item).toHaveAttribute('aria-current', 'true');
  const calf = await screen.findByRole('spinbutton', { name: 'Current weight for Calf raise in kg' });
  await waitFor(() => expect(calf).toHaveFocus());
}, 15000);
