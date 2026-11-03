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
const box = (purpose: 'custom-tracker' | 'fitness-tracking') => screen.findByRole('checkbox', { name: NOTICES[purpose].label });

it('shows both tracker purposes as separate choices reflecting the server and writes nothing on mount', async () => {
  setup(trackerAccess({ fitnessConsent: false, canWriteFitness: false }));
  expect(await box('custom-tracker')).toBeChecked();
  expect(await box('fitness-tracking')).not.toBeChecked();
  expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
  expect(screen.getByText(NOTICES['fitness-tracking'].body)).toBeInTheDocument();
  expect(mocks.setConsent).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Prepare data download' })).toBeEnabled();
});

it('gives each Profile section its own key, so a re-render cannot leave a stale copy on screen', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    setup(noGrant());
    await box('custom-tracker');
    await waitFor(() => expect(mocks.fetchAge).toHaveBeenCalled());
    await screen.findByText(NOTICES['custom-tracker'].body);
    const duplicates = errors.mock.calls.filter(call => String(call[0]).includes('two children with the same key'));
    expect(duplicates).toEqual([]);
  } finally { errors.mockRestore(); }
});

it('holds both grants and shows no notice until the age read answers, then shows the teen text', async () => {
  let answer: (value: unknown) => void = () => undefined;
  mocks.fetchAge.mockReturnValue(new Promise(resolve => { answer = resolve; }));
  setup(noGrant());
  const custom = await box('custom-tracker');
  expect(custom).toBeDisabled();
  expect(await box('fitness-tracking')).toBeDisabled();
  expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
  expect(screen.queryByText(NOTICES['custom-tracker'].childBody)).not.toBeInTheDocument();
  expect(screen.getAllByText('Checking your account…')).toHaveLength(2);
  answer({ userId: 'owner-a', birthDate: '2012-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: false });
  expect(await screen.findByText(NOTICES['custom-tracker'].childBody)).toBeInTheDocument();
  expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
  expect(screen.queryByText('Checking your account…')).not.toBeInTheDocument();
  expect(custom).toBeEnabled();
});

it('falls back to the adult notice with the grant open when the age read fails, because the server still decides', async () => {
  mocks.fetchAge.mockRejectedValue(new Error('down'));
  setup(noGrant());
  expect(await screen.findByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
  expect(screen.queryByText('Checking your account…')).not.toBeInTheDocument();
  expect(await box('custom-tracker')).toBeEnabled();
});

it('grants Gym tracking alone with its notice version and a copy of the captured revision', async () => {
  const access = trackerAccess({ fitnessConsent: false, canWriteFitness: false });
  const next = { ...trackerAccess({}), revision: { ...access.revision, consentVersion: 2 } };
  mocks.setConsent.mockResolvedValue(next);
  const user = userEvent.setup(); setup(access);
  await user.click(await box('fitness-tracking'));
  await waitFor(() => expect(mocks.setConsent).toHaveBeenCalledTimes(1));
  expect(mocks.setConsent).toHaveBeenCalledWith('fitness-tracking', true, NOTICES['fitness-tracking'].version, access.revision);
  expect(mocks.setConsent.mock.calls[0][3]).not.toBe(access.revision);
  await waitFor(() => expect(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label })).toBeChecked());
  expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).toBeChecked();
});

it('withdraws custom tracker permission without touching Gym', async () => {
  const access = trackerAccess();
  mocks.setConsent.mockResolvedValue({ ...access, customConsent: false, canWriteCustom: false, revision: { ...access.revision, consentVersion: 2 } });
  const user = userEvent.setup(); setup(access);
  await user.click(await box('custom-tracker'));
  await waitFor(() => expect(mocks.setConsent).toHaveBeenCalledWith('custom-tracker', false, NOTICES['custom-tracker'].version, access.revision));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).not.toBeChecked());
  expect(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label })).toBeChecked();
  expect(mocks.setConsent).toHaveBeenCalledTimes(1);
});

it('re-reads access and keeps the checkbox unchanged when the change is refused as stale', async () => {
  const user = userEvent.setup(); setup(noGrant());
  mocks.kind.mockReturnValue('access-changed');
  mocks.setConsent.mockRejectedValue(Object.assign(new Error('stale'), { code: 'ET003' }));
  const fitness = await box('fitness-tracking');
  const reads = mocks.fetchAccess.mock.calls.length;
  await user.click(fitness);
  expect(await screen.findByText(/permissions or this record changed/i)).toBeInTheDocument();
  await waitFor(() => expect(mocks.fetchAccess.mock.calls.length).toBeGreaterThan(reads));
  expect(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label })).not.toBeChecked();
  expect(mocks.setConsent).toHaveBeenCalledTimes(1);
});

it('under 12: turning a purpose on is closed, but withdrawing stays open', async () => {
  const user = userEvent.setup();
  setup(trackerAccess({ canWriteBasic: false, canWriteCustom: false, canWriteFitness: false, fitnessConsent: false }));
  expect(await box('fitness-tracking')).toBeDisabled();
  expect(await box('custom-tracker')).toBeEnabled();
  expect(screen.getAllByText(/paused for this account/i).length).toBeGreaterThan(0);
  await user.click(screen.getByRole('checkbox', { name: NOTICES['fitness-tracking'].label }));
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it('a purpose that is simply off stays available to turn on; this panel never blocks on the mailbox', async () => {
  setup(trackerAccess({ customConsent: false, canWriteCustom: false }));
  expect(await box('custom-tracker')).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: NOTICES['custom-tracker'].label })).not.toBeChecked();
});

it('keeps the rest of Profile usable and explains when permission settings cannot be read', async () => {
  setup(new Error('network'));
  expect(await screen.findByText(/Tracker permission settings are unavailable/i)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: NOTICES['custom-tracker'].label })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Display name')).toBeEnabled();
  expect(within(screen.getByRole('dialog', { name: 'EDIT DETAILS' })).getByRole('button', { name: 'SAVE' })).toBeEnabled();
  expect(mocks.setConsent).not.toHaveBeenCalled();
});

it('refuses a capability that belongs to another owner', async () => {
  setup(trackerAccess({}, 'owner-b'));
  expect(await screen.findByText(/Tracker permission settings are unavailable/i)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: NOTICES['custom-tracker'].label })).not.toBeInTheDocument();
});
