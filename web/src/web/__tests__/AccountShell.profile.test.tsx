// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_NOTICE_VERSION, type ProcessingAccess } from '@eiyu/shared';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), ownerId: 'owner-a' }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<object>(),
  fetchProcessingAccess: () => mocks.fetch(),
  setProcessingConsent: (...args: unknown[]) => mocks.save(...args),
  fetchTrackerAccess: async () => (await import('../../test/tracker-fixtures')).trackerAccess({}, mocks.ownerId),
  subscribeTrackerAccessChanges: () => () => undefined,
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: () => ({ user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C' }, saveProfile: vi.fn() }) }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: vi.fn(), user: { id: mocks.ownerId } }) }));
vi.mock('../WebSettings', () => ({ default: () => null }));
import ProtectedLayout from '../../ProtectedLayout';

const access = (over: Partial<ProcessingAccess> = {}): ProcessingAccess => ({
  contractVersion: 1, userId: 'owner-a', ageVersion: 1, consentVersion: 3, authorityVersion: 0, mailboxVersion: 2,
  ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true,
  authorityState: 'not-required', ...over,
});

afterEach(cleanup);
beforeEach(() => {
  mocks.ownerId = 'owner-a';
  mocks.fetch.mockReset().mockResolvedValue(access());
  mocks.save.mockReset();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <ProtectedLayout />, children: [{ path: '/board', element: <p>BOARD</p> }] }], { initialEntries: ['/board?account=profile'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const dialog = () => screen.getByRole('dialog', { name: 'EDIT DETAILS' });

describe('Profile after the simplification', () => {
  it('has no birthday, permission, review or retention wording or fields', async () => {
    setup();
    await screen.findByRole('button', { name: 'Prepare data download' });
    const text = dialog().textContent ?? '';
    expect(text).not.toMatch(/birthday|birth date|child|teen|under 1[38]|guardian/i);
    expect(text).not.toMatch(/request (a )?review|review request|retention|read-only for 30 days|paused for this account/i);
    expect(screen.queryByLabelText('Birthday')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('keeps Download your data next to the name and class fields', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Prepare data download' })).toBeEnabled();
    expect(screen.getByLabelText('Display name')).toHaveValue('Yuki Tanaka');
    expect(screen.getByLabelText('Class')).toHaveValue('Ranger');
  });

  it('stays usable when the AI access read fails, and says the AI choice is unavailable', async () => {
    mocks.fetch.mockRejectedValue(new Error('network'));
    setup();
    expect(await screen.findByText(/AI weekly review settings are unavailable/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toBeEnabled();
    expect(within(dialog()).getByRole('button', { name: 'SAVE' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /turn off ai weekly review/i })).not.toBeInTheDocument();
  });
});

describe('AI off switch', () => {
  it('shows that AI weekly review is on and offers to turn it off', async () => {
    setup();
    expect(await screen.findByText(/AI weekly review is on/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off AI weekly review' })).toBeEnabled();
  });

  it('turns it off with the current notice and the access that was read, and says so', async () => {
    const before = access();
    mocks.fetch.mockResolvedValue(before);
    mocks.save.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false, consentVersion: 4 }));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Turn off AI weekly review' }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith('weekly-debrief', false, AI_NOTICE_VERSION, before);
    expect(await screen.findByText(/AI weekly review is off/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off AI weekly review' })).not.toBeInTheDocument();
  });

  it('never offers a way to turn it on: when it is off there is no button, no box and no call', async () => {
    mocks.fetch.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
    setup();
    expect(await screen.findByText(/AI weekly review is off/i)).toBeInTheDocument();
    expect(screen.getByText(/Status page/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on|enable/i })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not let a second click send a second request while the first is running', async () => {
    let finish!: (value: ProcessingAccess) => void;
    mocks.save.mockReturnValue(new Promise<ProcessingAccess>(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    setup();
    const button = await screen.findByRole('button', { name: 'Turn off AI weekly review' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    finish(access({ aiConsent: false, canGenerateDebrief: false }));
    expect(await screen.findByText(/AI weekly review is off/i)).toBeInTheDocument();
  });

  it('keeps it on and shows the reason when the save fails', async () => {
    mocks.save.mockRejectedValue(new Error('server unavailable'));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Turn off AI weekly review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server unavailable');
    expect(screen.getByText(/AI weekly review is on/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off AI weekly review' })).toBeEnabled();
  });

  it('re-reads access after a stale save and offers the fresh state', async () => {
    mocks.fetch.mockResolvedValueOnce(access()).mockResolvedValueOnce(access({ aiConsent: false, canGenerateDebrief: false, consentVersion: 5 }));
    mocks.save.mockRejectedValue({ code: 'EP002', message: 'Processing access changed. Refresh your choices.' });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Turn off AI weekly review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Processing access changed');
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/AI weekly review is off/i)).toBeInTheDocument();
  });

  it('refuses to act on access that belongs to another account', async () => {
    mocks.fetch.mockResolvedValue(access({ userId: 'someone-else' }));
    setup();
    expect(await screen.findByText(/AI weekly review settings are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off AI weekly review' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('ignores a result for another account and does not claim it is off', async () => {
    mocks.save.mockResolvedValue(access({ userId: 'someone-else', aiConsent: false, canGenerateDebrief: false }));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Turn off AI weekly review' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/AI weekly review is on/i)).toBeInTheDocument();
  });

  it('does not change the name or class fields or make the dialog dirty', async () => {
    mocks.save.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
    const user = userEvent.setup();
    const router = setup();
    await user.click(await screen.findByRole('button', { name: 'Turn off AI weekly review' }));
    await screen.findByText(/AI weekly review is off/i);
    await router.navigate('/board');
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });
});
