// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), recent: vi.fn(), cleanup: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(), fetchGym: mocks.fetchGym,
  fetchRecentGymWeights: mocks.recent, listGymMediaCleanup: mocks.cleanup,
}));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import { RestoreIcon } from '../../Icons';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  mocks.cleanup.mockReset().mockResolvedValue([]);
  mocks.recent.mockReset().mockResolvedValue([]);
  mocks.data = {
    routines: [{ id: 'routine', user_id: 'owner', name: 'Upper body', unit: 'kg', archived: false, created_at: '2026-10-01' }],
    exercises: [{ id: 'bench', routine_id: 'routine', user_id: 'owner', name: 'Bench press', position: 0, sets: 3, reps: '8-12', rest_seconds: 90, rir: 2, notes: '', media_path: null, media_mime: null }],
  } as unknown as GymData;
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

it('has no session footer: the page ends with the exercise detail', async () => {
  setup();
  await screen.findByRole('region', { name: 'Bench press details' });
  expect(document.querySelector('footer')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  expect(screen.queryByText(/Workout draft/)).toBeNull();
});

it('puts Current weight in the stats row, with its log button next to the input', async () => {
  setup();
  const detail = await screen.findByRole('region', { name: 'Bench press details' });
  const current = within(detail).getByText('Current', { selector: 'dt' }).closest('div')!;
  expect(current.querySelector('form.gym-log')).not.toBeNull();
  const form = current.querySelector('form.gym-log')!;
  expect(Array.from(form.querySelectorAll('input, button')).map(el => el.tagName)).toEqual(['INPUT', 'BUTTON']);
  expect(within(form as HTMLElement).getByRole('button', { name: 'Log weight for Bench press' })).toHaveAttribute('type', 'submit');
});

it('keeps the archived toggle labelled and reachable', async () => {
  setup();
  const toggle = await screen.findByRole('checkbox', { name: 'Include archived routines' });
  expect(toggle).not.toBeChecked();
  expect(toggle.closest('.gym-toolbar')).not.toBeNull();
});

it('keeps Add exercise as the one visible routine action and moves the rest into a menu', async () => {
  const user = userEvent.setup(); setup();
  const add = await screen.findByRole('button', { name: 'Add exercise' });
  const group = add.closest('.gym-actions')!;
  expect(within(group as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Add exercise', 'Routine actions for Upper body']);
  await user.click(within(group as HTMLElement).getByRole('button', { name: 'Routine actions for Upper body' }));
  expect(screen.getByRole('menuitem', { name: 'Delete routine' })).toHaveClass('is-danger');
});

it('keeps the routine actions disabled for an archived routine where they were before', async () => {
  mocks.data.routines[0].archived = true;
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Include archived routines' }));
  expect(await screen.findByRole('button', { name: 'Add exercise' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Routine actions for Upper body' }));
  expect(screen.getByRole('menuitem', { name: 'Restore routine' })).toBeEnabled();
  const restoreIcon = render(<RestoreIcon />).container.innerHTML;
  expect(screen.getByRole('menuitem', { name: 'Restore routine' }).querySelector('svg')!.outerHTML).toBe(restoreIcon);
});
