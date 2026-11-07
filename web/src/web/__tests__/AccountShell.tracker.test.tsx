// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TRACKER_PURPOSE_NOTICES as NOTICES, type TrackerAccess } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ fetchAccess: vi.fn(), setConsent: vi.fn(), kind: vi.fn(), fetchAge: vi.fn(), access: null as unknown as TrackerAccess }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(),
  fetchTrackerAccess: mocks.fetchAccess, subscribeTrackerAccessChanges: () => () => undefined,
  setTrackerConsent: (...args: unknown[]) => mocks.setConsent(...args), trackerErrorKind: (error: unknown) => mocks.kind(error),
  fetchAccountAge: () => mocks.fetchAge(),
  setAccountBirthday: vi.fn(),
  fetchProcessingAccess: async () => ({ contractVersion: 1, userId: 'owner-a', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
    ageEligible: true, ageConsent: true, aiConsent: false, canReadDebrief: true, canGenerateDebrief: false, authorityState: 'not-required' }),
  setProcessingConsent: vi.fn(),
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: () => ({ user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C' }, saveProfile: vi.fn() }) }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: vi.fn(), user: { id: 'owner-a' } }) }));
vi.mock('../WebSettings', () => ({ default: () => null }));
import ProtectedLayout from '../../ProtectedLayout';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(cleanup);
beforeEach(() => {
  mocks.fetchAccess.mockReset().mockImplementation(async () => mocks.access);
  mocks.setConsent.mockReset(); mocks.kind.mockReset().mockReturnValue(null);
  mocks.fetchAge.mockReset().mockResolvedValue({ userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false });
});

function setup(access: TrackerAccess | Error) {
  if (access instanceof Error) mocks.fetchAccess.mockRejectedValue(access); else mocks.access = access;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <ProtectedLayout />, children: [{ path: '/board', element: <p>BOARD</p> }] }], { initialEntries: ['/board?account=profile'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
const choice = (purpose: 'custom-tracker' | 'fitness-tracking') => screen.queryByRole('checkbox', { name: NOTICES[purpose].label });

// Open tracker (065): custom quests and Gym need no permission, so Profile no longer offers the two choices.
// Turning them off would do nothing. Phase 1 deletes the components; this keeps the live Profile honest meanwhile.
it('shows no custom or Gym permission choice and none of their notices', async () => {
  setup(trackerAccess({ fitnessConsent: false, canWriteFitness: false }));
  await screen.findByRole('button', { name: 'Prepare data download' });
  expect(choice('custom-tracker')).not.toBeInTheDocument();
  expect(choice('fitness-tracking')).not.toBeInTheDocument();
  expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
  expect(screen.queryByText(NOTICES['fitness-tracking'].body)).not.toBeInTheDocument();
  expect(screen.queryByText(NOTICES['custom-tracker'].childBody)).not.toBeInTheDocument();
  expect(screen.queryByText(/permissions or this record changed/i)).not.toBeInTheDocument();
});

it('shows no retention or paused-tracker message about these permissions', async () => {
  setup(trackerAccess({ canWriteBasic: false, canWriteCustom: false, canWriteFitness: false, fitnessConsent: false }));
  await screen.findByRole('button', { name: 'Prepare data download' });
  expect(screen.queryByText(/paused for this account/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/read-only for 30 days/i)).not.toBeInTheDocument();
});

it('neither reads nor writes tracker permissions from Profile', async () => {
  setup(trackerAccess());
  await screen.findByRole('button', { name: 'Prepare data download' });
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it('does not warn that permission settings are unavailable when the access read fails, and keeps Profile usable', async () => {
  setup(new Error('network'));
  expect(await screen.findByLabelText('Display name')).toBeEnabled();
  expect(screen.queryByText(/Tracker permission settings are unavailable/i)).not.toBeInTheDocument();
  expect(within(screen.getByRole('dialog', { name: 'EDIT DETAILS' })).getByRole('button', { name: 'SAVE' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Prepare data download' })).toBeEnabled();
});

it('keeps the data download and the AI choice in Profile', async () => {
  setup(trackerAccess());
  expect(await screen.findByRole('button', { name: 'Prepare data download' })).toBeEnabled();
  await waitFor(() => expect(mocks.fetchAge).toHaveBeenCalled());
});
