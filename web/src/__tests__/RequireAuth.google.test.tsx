// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  session: { value: null as unknown },
  signOut: vi.fn(),
  fetchTermsStatus: vi.fn(),
}));

vi.mock('../store/session-context', () => ({
  useSession: () => ({ session: api.session.value, loading: false, signOut: api.signOut }),
}));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@eiyu/shared')>()),
  fetchTermsStatus: api.fetchTermsStatus,
}));

import RequireAuth from '../RequireAuth';

const terms = (accepted: boolean, userId = 'u1') => ({ userId, accepted, version: accepted ? '2026-11-08-terms-v2' : null });

function mount() {
  return render(
    <MemoryRouter initialEntries={['/board']}>
      <Routes>
        <Route element={<RequireAuth />}><Route path="/board" element={<p>Board content</p>} /></Route>
        <Route path="/auth" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.signOut.mockResolvedValue({ error: null });
  api.fetchTermsStatus.mockResolvedValue(terms(false));
});
afterEach(cleanup);

it('sends a signed-out visitor to sign-in', () => {
  api.session.value = null;
  mount();
  expect(screen.getByText('Sign-in page')).toBeInTheDocument();
  expect(api.fetchTermsStatus).not.toHaveBeenCalled();
});

it('blocks the app behind the Terms screen for a new Google account', async () => {
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
  expect(screen.queryByText('Board content')).not.toBeInTheDocument();
});

it('uses the real sign-out from the session from the Terms screen', async () => {
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(api.signOut).toHaveBeenCalledTimes(1);
});

it('opens the app for an account that has accepted the Terms', async () => {
  api.fetchTermsStatus.mockResolvedValue(terms(true));
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  expect(await screen.findByText('Board content')).toBeInTheDocument();
});

it('looks up a password account too, and opens the app when it has a Terms row', async () => {
  api.fetchTermsStatus.mockResolvedValue(terms(true, 'u2'));
  api.session.value = { user: { id: 'u2', app_metadata: { provider: 'email' } } };
  mount();
  expect(await screen.findByText('Board content')).toBeInTheDocument();
  expect(api.fetchTermsStatus).toHaveBeenCalledTimes(1);
});

it('opens the app when the Terms status cannot be read, so nobody is trapped', async () => {
  api.fetchTermsStatus.mockRejectedValue(new Error('offline'));
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  expect(await screen.findByText('Board content')).toBeInTheDocument();
});
