// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchProcessingAccess: vi.fn(),
  setProcessingConsent: vi.fn(),
  setAccountBirthday: vi.fn(),
  fetchAccountAge: vi.fn(),
  finishGoogleSignup: vi.fn(),
}));

vi.mock('@eiyu/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@eiyu/shared')>()),
  fetchProcessingAccess: api.fetchProcessingAccess,
  setProcessingConsent: api.setProcessingConsent,
  setAccountBirthday: api.setAccountBirthday,
  fetchAccountAge: api.fetchAccountAge,
  finishGoogleSignup: api.finishGoogleSignup,
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

function age(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1', birthDate: null, pendingBirthDate: null, correctionPending: false,
    adultDeclared: false, trackerWritesPaused: false, version: 0, ...overrides,
  };
}

const TERMS = 'I agree to the Privacy Policy & Terms';

function mount(user = googleUser, onSignOut = vi.fn().mockResolvedValue({ error: null })) {
  const view = render(<GoogleFinishGate user={user} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
  return { ...view, onSignOut };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchProcessingAccess.mockResolvedValue(access());
  api.fetchAccountAge.mockResolvedValue(age());
  api.finishGoogleSignup.mockResolvedValue({ access: access({ ageConsent: true, consentVersion: 1 }), age: age({ birthDate: '2000-01-01', version: 1 }) });
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, birthday = '2000-01-01', consent = true, terms = true) {
  await user.type(await screen.findByLabelText('Birthday'), birthday);
  if (consent) await user.click(screen.getByRole('checkbox', { name: PROCESSING_NOTICES['age-screening'].label }));
  if (terms) await user.click(screen.getByRole('checkbox', { name: TERMS }));
  await user.click(screen.getByRole('button', { name: 'FINISH SIGN-UP' }));
}

describe('who sees the finish screen', () => {
  it('shows it, and blocks the app, for a Google account without age consent', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('lets a Google account with consent and a birthday straight through', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true }));
    api.fetchAccountAge.mockResolvedValue(age({ birthDate: '2000-01-01', version: 1 }));
    mount();
    expect(await screen.findByText('App content')).toBeInTheDocument();
  });

  it('shows it for a half-finished account: consent saved but no birthday', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: PROCESSING_NOTICES['age-screening'].label })).toBeChecked();
  });

  it('fails closed when the birthday status cannot be loaded', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true }));
    api.fetchAccountAge.mockRejectedValueOnce(new Error('network down'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your account/i);
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('fails closed when the birthday status belongs to a different account', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true }));
    api.fetchAccountAge.mockResolvedValue(age({ userId: 'someone-else', birthDate: '2000-01-01' }));
    mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
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
    expect(api.finishGoogleSignup).not.toHaveBeenCalled();
  });
});

describe('finishing', () => {
  const noSave = () => {
    expect(api.finishGoogleSignup).not.toHaveBeenCalled();
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  };

  it('saves consent and birthday in one call for this account, then opens the app', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user);
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.finishGoogleSignup).toHaveBeenCalledTimes(1);
    expect(api.finishGoogleSignup).toHaveBeenCalledWith('2000-01-01', access());
    expect(api.setProcessingConsent).not.toHaveBeenCalled();
    expect(api.setAccountBirthday).not.toHaveBeenCalled();
  });

  it('finishes a half-finished account with the one call, without asking for consent again', async () => {
    const user = userEvent.setup();
    const half = access({ ageConsent: true, consentVersion: 1 });
    api.fetchProcessingAccess.mockResolvedValue(half);
    mount();
    await fillAndSubmit(user, '2000-01-01', false);
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.finishGoogleSignup).toHaveBeenCalledWith('2000-01-01', half);
  });

  it('does not save anything without the permission box', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user, '2000-01-01', false);
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
    noSave();
  });

  it('does not save anything without the Terms box', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user, '2000-01-01', true, false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Accept the Privacy Policy and Terms to continue.');
    noSave();
  });

  it('starts with the Terms box unticked, even for a half-finished account', async () => {
    api.fetchProcessingAccess.mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
    mount();
    expect(await screen.findByRole('checkbox', { name: TERMS })).not.toBeChecked();
  });

  it('opens the Privacy Policy and the Terms of Use from the Terms row', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Terms of Use' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Terms of Use/i);
    await user.click(screen.getByRole('button', { name: /close/i }));
    await user.click(screen.getByRole('button', { name: 'Privacy Policy' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('SIGNING IN WITH GOOGLE');
  });

  it('rejects an invalid birthday without saving', async () => {
    const user = userEvent.setup();
    mount();
    await fillAndSubmit(user, '2000-13-45');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    noSave();
  });

  it('rejects a birthday under 12 with the sign-up message, without saving', async () => {
    const user = userEvent.setup();
    const year = new Date().getFullYear() - 5;
    mount();
    await fillAndSubmit(user, `${year}-01-01`);
    expect(await screen.findByRole('alert')).toHaveTextContent('New Eiyu accounts are for ages 12 and above.');
    noSave();
  });

  it('keeps the user on the screen with an error when the save fails, and a retry sends the same call', async () => {
    const user = userEvent.setup();
    api.finishGoogleSignup.mockRejectedValueOnce(new Error('birthday failed'));
    mount();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'FINISH SIGN-UP' }));
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.finishGoogleSignup).toHaveBeenCalledTimes(2);
    expect(api.finishGoogleSignup.mock.calls[1]).toEqual(['2000-01-01', access()]);
  });

  it('ignores a second press while saving', async () => {
    const user = userEvent.setup();
    api.finishGoogleSignup.mockReturnValue(new Promise(() => {}));
    mount();
    await fillAndSubmit(user);
    await user.click(screen.getByRole('button', { name: /SAVING/ }).closest('button')!);
    expect(api.finishGoogleSignup).toHaveBeenCalledTimes(1);
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
