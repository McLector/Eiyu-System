// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GymData } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ data: {} as GymData, fetchGym: vi.fn(), history: vi.fn(), previous: vi.fn(), cleanupList: vi.fn(), saveRoutine: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(), fetchGym: mocks.fetchGym, fetchGymHistory: mocks.history,
  fetchPreviousGymWeights: mocks.previous, listGymMediaCleanup: mocks.cleanupList, saveGymRoutine: mocks.saveRoutine,
}));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
import WebGym from '../WebGym';
import ArchiveNotice from '../../components/ArchiveNotice';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  mocks.cleanupList.mockReset().mockResolvedValue([]);
  mocks.previous.mockReset().mockResolvedValue([]);
  mocks.history.mockReset().mockResolvedValue({ sessions: [], entries: [], hasNext: false });
  mocks.data = { routines: [], exercises: [], sessions: [], entries: [] } as unknown as GymData;
  mocks.fetchGym.mockReset().mockImplementation(async () => structuredClone(mocks.data));
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/gym', element: <NavigationGuard><WebGym /><ArchiveNotice onOpen={vi.fn()} /></NavigationGuard> }], { initialEntries: ['/gym'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

it('tells a new Hunter what to do when there is no routine yet', async () => {
  setup();
  expect(await screen.findByText('No routine yet. Create one, then add its exercises.')).toBeInTheDocument();
});

it('reads the training log, then says plainly that no workouts are on record', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Workout history' }));
  expect(await screen.findByText('No workouts on record. Finish one and it appears here.')).toBeInTheDocument();
});

it('offers to retry cleanup when a demonstration file is still waiting, and only then', async () => {
  mocks.cleanupList.mockRejectedValueOnce(new Error('Storage unreachable'));
  setup();
  expect(await screen.findByRole('button', { name: 'Retry media cleanup' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByText(/A demonstration file is still waiting for cleanup — Storage unreachable/).length).toBeGreaterThan(0));
});

it('does not offer the cleanup retry when cleanup succeeded', async () => {
  setup();
  await screen.findByText('No routine yet. Create one, then add its exercises.');
  expect(screen.queryByRole('button', { name: 'Retry media cleanup' })).toBeNull();
});
