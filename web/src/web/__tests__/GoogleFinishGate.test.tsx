// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchTermsStatus: vi.fn(),
  acceptTerms: vi.fn(),
}));

vi.mock('@eiyu/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@eiyu/shared')>()),
  fetchTermsStatus: api.fetchTermsStatus,
  acceptTerms: api.acceptTerms,
}));

import GoogleFinishGate from '../GoogleFinishGate';

const googleUser = { id: 'u1', app_metadata: { provider: 'google' } };
const passwordUser = { id: 'u2', app_metadata: { provider: 'email' } };

const terms = (accepted: boolean, userId = 'u1') => ({ userId, accepted, version: accepted ? '2026-11-08-terms-v2' : null });

const TERMS = 'I agree to the Privacy Policy & Terms';
const CONTINUE = { name: 'CONTINUE' };

function mount(user: { id: string; app_metadata?: Record<string, unknown> } = googleUser, onSignOut = vi.fn().mockResolvedValue({ error: null })) {
  const view = render(<GoogleFinishGate user={user} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
  return { ...view, onSignOut };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchTermsStatus.mockResolvedValue(terms(false));
  api.acceptTerms.mockResolvedValue({ userId: 'u1', accepted: true, version: '2026-11-08-terms-v2' });
});
afterEach(cleanup);

describe('who sees the Terms screen', () => {
  it('blocks the app for a new Google account with no Terms row', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('keys on the missing row, not on Google: a password account without one sees it too', async () => {
    api.fetchTermsStatus.mockResolvedValue(terms(false, 'u2'));
    mount(passwordUser);
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(api.fetchTermsStatus).toHaveBeenCalledTimes(1);
  });

  it('lets an account that has accepted the Terms straight through', async () => {
    api.fetchTermsStatus.mockResolvedValue(terms(true));
    mount();
    expect(await screen.findByText('App content')).toBeInTheDocument();
  });

  it('holds the app back while the status loads', () => {
    api.fetchTermsStatus.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });

  it('never traps: a status read that fails opens the app', async () => {
    api.fetchTermsStatus.mockRejectedValue(new Error('network down'));
    mount();
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Finish signing up' })).not.toBeInTheDocument();
  });

  it('never traps: a status that belongs to another account opens the app instead of asking', async () => {
    api.fetchTermsStatus.mockResolvedValue(terms(false, 'someone-else'));
    mount();
    expect(await screen.findByText('App content')).toBeInTheDocument();
  });

  it('keeps the ticked box when a token refresh hands over a new user object', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const view = render(<GoogleFinishGate user={googleUser} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    await user.click(await screen.findByRole('checkbox', { name: TERMS }));
    view.rerender(<GoogleFinishGate user={{ ...googleUser }} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    expect(screen.getByRole('checkbox', { name: TERMS })).toBeChecked();
    expect(api.fetchTermsStatus).toHaveBeenCalledTimes(1);
  });

  it('looks again when a different account signs in', async () => {
    const onSignOut = vi.fn();
    const view = render(<GoogleFinishGate user={googleUser} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    await screen.findByRole('heading', { name: 'Finish signing up' });
    api.fetchTermsStatus.mockResolvedValue(terms(true, 'u2'));
    view.rerender(<GoogleFinishGate user={passwordUser} onSignOut={onSignOut}><p>App content</p></GoogleFinishGate>);
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.fetchTermsStatus).toHaveBeenCalledTimes(2);
  });

  it('shows the screen again after a reload or sleep, until the Terms are accepted', async () => {
    const first = mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    first.unmount();
    mount();
    expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    expect(api.acceptTerms).not.toHaveBeenCalled();
  });
});

describe('what the screen asks', () => {
  it('asks only for the Terms: no birthday, age or permission wording', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Finish signing up' });
    expect(screen.queryByLabelText('Birthday')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/birthday|child|permission|under 12|ages 12/i)).not.toBeInTheDocument();
  });

  it('starts with the Terms box unticked and Continue disabled', async () => {
    mount();
    expect(await screen.findByRole('checkbox', { name: TERMS })).not.toBeChecked();
    expect(screen.getByRole('button', CONTINUE)).toBeDisabled();
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
});

describe('continuing', () => {
  it('enables Continue once the box is ticked, accepts once for this account, then opens the app', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('checkbox', { name: TERMS }));
    expect(screen.getByRole('button', CONTINUE)).toBeEnabled();
    await user.click(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.acceptTerms).toHaveBeenCalledTimes(1);
    expect(api.acceptTerms).toHaveBeenCalledWith('u1');
  });

  it('un-ticking turns Continue off again, and nothing is saved', async () => {
    const user = userEvent.setup();
    mount();
    const box = await screen.findByRole('checkbox', { name: TERMS });
    await user.click(box); await user.click(box);
    expect(screen.getByRole('button', CONTINUE)).toBeDisabled();
    expect(api.acceptTerms).not.toHaveBeenCalled();
  });

  it('keeps the screen with an alert when saving fails, and a retry accepts once more', async () => {
    const user = userEvent.setup();
    api.acceptTerms.mockRejectedValueOnce(new Error('Could not save your agreement.'));
    mount();
    await user.click(await screen.findByRole('checkbox', { name: TERMS }));
    await user.click(screen.getByRole('button', CONTINUE));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your agreement.');
    expect(screen.getByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(api.acceptTerms).toHaveBeenCalledTimes(2);
  });

  it('sends one request when Continue is pressed twice while saving', async () => {
    const user = userEvent.setup();
    api.acceptTerms.mockReturnValue(new Promise(() => {}));
    mount();
    await user.click(await screen.findByRole('checkbox', { name: TERMS }));
    await user.click(screen.getByRole('button', CONTINUE));
    await user.click(screen.getByRole('button', { name: /SAVING/ }));
    expect(api.acceptTerms).toHaveBeenCalledTimes(1);
  });

  it('keeps sign-out available, and uses it', async () => {
    const user = userEvent.setup();
    const { onSignOut } = mount();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('survives a sign-out that rejects', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn().mockRejectedValue(new Error('offline'));
    mount(googleUser, onSignOut);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
  });
});
