// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchProcessingAccess: vi.fn(),
  setProcessingConsent: vi.fn(),
  setAccountBirthday: vi.fn(),
}));

vi.mock('@eiyu/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@eiyu/shared')>()),
  fetchProcessingAccess: api.fetchProcessingAccess,
  setProcessingConsent: api.setProcessingConsent,
  setAccountBirthday: api.setAccountBirthday,
}));

import GoogleFinishGate from '../GoogleFinishGate';
import { PROCESSING_NOTICES } from '@eiyu/shared';

const googleUser = { id: 'u1', app_metadata: { provider: 'google' } };
const passwordUser = { id: 'u2', app_metadata: { provider: 'email' } };

function access(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1, userId: 'u1', ageVersion: 0, consentVersion: 0, authorityVersion: 0, mailboxVersion: 1,
    ageEligible: false, canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required',
    ageConsent: false, aiConsent: false, ...overrides,
  };
}

function mount(user = googleUser, onSignOut = vi.fn().mockResolvedValue({ error: null })) {
  const view = render(<GoogleFinishGate user={user} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
  return { ...view, onSignOut };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchProcessingAccess.mockResolvedValue(access());
  api.setProcessingConsent.mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
  api.setAccountBirthday.mockResolvedValue({ userId: 'u1', birthDate: '2000-01-01' });
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, birthday = '2000-01-01', consent = true) {
  await user.type(await screen.findByLabelText('Birthday'), birthday);
  if (consent) await user.click(screen.getByRole('checkbox', { name: PROCESSING_NOTICES['age-screening'].label }));
  await user.click(screen.getByRole('button', { name: 'FINISH SIGN-UP' }));
}

describe('who sees the finish screen', () => {
  it('shows it, and blocks the app, for a Google account without age consent', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('lets a Google account that already has consent straight through', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true }));
    mount();
    expect(await screen.findByText('App content')).toBeInTheDocument();
  });

  it('never asks a password account, and does not even look up its status', async () => {
    mount(passwordUser as never);
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.fetchProcessingAccess).not.toHaveBeenCalled();
  });

  it('holds the app back while the status loads', () => {
    api.fetchProcessingAccess.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('fails closed when the status cannot be loaded, with retry and sign-out', async () => {
    api.fetchProcessingAccess.mockRejectedValueOnce(new Error('network down'));
    const { onSignOut } = mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your account/i);
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
  });

  it('fails closed when the status belongs to a different account', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ userId: 'someone-else', ageConsent: true }));
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('keeps what was typed when a token refresh hands over a new user object', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const view = render(<GoogleFinishGate user={googleUser} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    await user.type(await screen.findByLabelText('Birthday'), '2000-01-01');
    view.rerender(<GoogleFinishGate user={{ ...googleUser }} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    expect(screen.getByLabelText('Birthday')).toHaveValue('2000-01-01');
    expect(api.fetchProcessingAccess).toHaveBeenCalledTimes(1);
  });

  it('shows the screen again after sign-out and sign-in if it was abandoned', async () => {
    const first = mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    first.unmount();
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });
});

describe('finishing', () => {
  it('saves consent first, then the birthday for this account, then opens the app', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user);
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.setProcessingConsent).toHaveBeenCalledWith('age-screening', true, PROCESSING_NOTICES['age-screening'].version, access());
    expect(api.setAccountBirthday).toHaveBeenCalledWith('2000-01-01', 'u1');
    expect(api.setProcessingConsent.mock.invocationCallOrder[0]).toBeLessThan(api.setAccountBirthday.mock.invocationCallOrder[0]);
  });

  it('does not save anything without the permission box', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user, '2000-01-01', false);
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });

  it('rejects an invalid birthday without saving', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user, '2000-13-45');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });

  it('rejects a birthday under 12 with the sign-up message, without saving', async () => {
    const user = userEvent.setup();
    const year = new Date().getFullYear() - 5;
    mount();
    await fillAndSubmit(user, `${year}-01-01`);
    expect(await screen.findByRole('alert')).toHaveTextContent('New Eiyu accounts are for ages 12 and above.');
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });

  it('keeps the user on the screen and shows an error when the consent save fails', async () => {
    const user = userEvent.setup();
    api.setProcessingConsent.mockRejectedValue(new Error('permission denied'));
    mount();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });

  it('keeps the user on the screen when the birthday save fails after consent saved, and retries without re-sending consent', async () => {
    const user = userEvent.setup();
    api.setAccountBirthday.mockRejectedValueOnce(new Error('birthday failed'));
    mount();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'FINISH SIGN-UP' }));
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.setProcessingConsent).toHaveBeenCalledTimes(1);
    expect(api.setAccountBirthday).toHaveBeenCalledTimes(2);
  });

  it('ignores a second press while saving', async () => {
    const user = userEvent.setup();
    api.setProcessingConsent.mockReturnValue(new Promise(() => {}));
    mount();
    await fillAndSubmit(user);
    await user.click(screen.getByRole('button', { name: /SAVING/ }).closest('button')!);
    expect(api.setProcessingConsent).toHaveBeenCalledTimes(1);
  });

  it('keeps sign-out available, and uses it', async () => {
    const user = userEvent.setup();
    const { onSignOut } = mount();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('never writes the birth date to browser storage', async () => {
    const user = userEvent.setup();
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    mount();
    await fillAndSubmit(user, '1999-07-04');
    await screen.findByText('App content');
    const written = setLocal.mock.calls.map(call => `${call[0]}=${call[1]}`).join('|');
    expect(written).not.toContain('1999-07-04');
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('1999-07-04');
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('1999-07-04');
    setLocal.mockRestore();
  });
});
