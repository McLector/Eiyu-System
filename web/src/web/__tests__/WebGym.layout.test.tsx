// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), start: vi.fn(), previous: vi.fn(), cleanup: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(), fetchGym: mocks.fetchGym, startGymSession: mocks.start,
  fetchPreviousGymWeights: mocks.previous, listGymMediaCleanup: mocks.cleanup,
}));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  mocks.cleanup.mockReset().mockResolvedValue([]);
  mocks.previous.mockReset().mockResolvedValue([]);
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Upper body', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }],
    sessions: [], entries: [],
  } as unknown as GymData;
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
  mocks.start.mockReset().mockImplementation(async () => {
    mocks.data.sessions.unshift({ id: 's0', routine_id: 'routine', user_id: 'owner', routine_name: 'Upper body', unit: 'kg', status: 'draft', created_at: '2026-10-01', completed_at: null } as never);
    mocks.data.entries.push({ id: 'e0', session_id: 's0', user_id: 'owner', exercise_id: 'bench', position: 0, prescription: { name: 'Bench press', sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '' }, weight: null } as never);
    return 's0';
  });
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

it('puts Start workout alone in the session footer when there is no draft', async () => {
  setup();
  const footer = (await screen.findByRole('button', { name: 'Start workout' })).closest('footer')!;
  expect(footer).toHaveClass('gym-session-actions');
  expect(within(footer).getAllByRole('button').map(b => b.textContent)).toEqual(['Start workout']);
});

it('orders the draft actions Discard, Save, Finish in the DOM so Tab order matches the visual order', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Start workout' }));
  const finish = await screen.findByRole('button', { name: 'Finish workout' });
  const footer = finish.closest('footer')!;
  expect(within(footer).getAllByRole('button').map(b => b.textContent)).toEqual(['Discard draft', 'Save draft', 'Finish workout']);
  expect(finish).toHaveClass('btn-primary');
  expect(within(footer).getByRole('button', { name: 'Discard draft' })).toHaveClass('btn-destructive');
  await waitFor(() => expect(within(footer).getByText(/Workout draft/)).toBeInTheDocument());
});

it('keeps the archived toggle labelled and reachable', async () => {
  setup();
  const toggle = await screen.findByRole('checkbox', { name: 'Include archived routines' });
  expect(toggle).not.toBeChecked();
  expect(toggle.closest('.gym-toolbar')).not.toBeNull();
});

it('groups routine actions by intent with Delete last and destructive', async () => {
  setup();
  const del = await screen.findByRole('button', { name: 'Delete routine' });
  const group = del.closest('.gym-actions')!;
  const names = within(group as HTMLElement).getAllByRole('button').map(b => b.textContent);
  expect(names).toEqual(['Add exercise', 'Edit routine', 'Archive routine', 'Delete routine']);
  expect(del).toHaveClass('btn-destructive');
  expect(within(group as HTMLElement).getByRole('button', { name: 'Archive routine' })).toHaveClass('btn-quiet');
  expect(within(group as HTMLElement).getByRole('button', { name: 'Edit routine' })).toHaveClass('btn-quiet');
});

it('keeps the routine actions disabled for an archived routine where they were before', async () => {
  mocks.data.routines[0].archived = true;
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Include archived routines' }));
  expect(await screen.findByRole('button', { name: 'Add exercise' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Restore routine' })).toBeEnabled();
});

it('shows each exercise row actions as one compact quiet group with Remove still destructive', async () => {
  setup();
  const remove = await screen.findByRole('button', { name: 'Remove' });
  const group = remove.closest('.gym-row-actions')!;
  expect(within(group as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Edit', 'Move Bench press up', 'Move Bench press down', 'Remove']);
  for (const b of within(group as HTMLElement).getAllByRole('button')) expect(b).toHaveClass('btn-compact');
  expect(remove).toHaveClass('btn-destructive');
});
