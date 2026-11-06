// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  session: { value: null as unknown },
  signOut: vi.fn(),
  fetchProcessingAccess: vi.fn(),
}));

vi.mock('../store/session-context', () => ({
  useSession: () => ({ session: api.session.value, loading: false, signOut: api.signOut }),
}));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...(await importOriginal<typeof import('@eiyu/shared')>()),
  fetchProcessingAccess: api.fetchProcessingAccess,
}));

import RequireAuth from '../RequireAuth';

const access = (ageConsent: boolean) => ({
  contractVersion: 1, userId: 'u1', ageVersion: 0, consentVersion: 0, authorityVersion: 0, mailboxVersion: 1,
  ageEligible: false, canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required', ageConsent, aiConsent: false,
});

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
  api.fetchProcessingAccess.mockResolvedValue(access(false));
});
afterEach(cleanup);

it('sends a signed-out visitor to sign-in', () => {
  api.session.value = null;
  mount();
  expect(screen.getByText('Sign-in page')).toBeInTheDocument();
});

it('blocks the app behind the finish screen for a Google account without consent', async () => {
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  expect(await screen.findByRole('heading', { name: 'Finish signing up' })).toBeInTheDocument();
  expect(screen.queryByText('Board content')).not.toBeInTheDocument();
});

it('uses the real sign-out from the session from the finish screen', async () => {
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(api.signOut).toHaveBeenCalledTimes(1);
});

it('opens the app for a Google account that has consent', async () => {
  api.fetchProcessingAccess.mockResolvedValue(access(true));
  api.session.value = { user: { id: 'u1', app_metadata: { provider: 'google' } } };
  mount();
  expect(await screen.findByText('Board content')).toBeInTheDocument();
});

it('opens the app for a password account without any lookup', async () => {
  api.session.value = { user: { id: 'u2', app_metadata: { provider: 'email' } } };
  mount();
  expect(await screen.findByText('Board content')).toBeInTheDocument();
  expect(api.fetchProcessingAccess).not.toHaveBeenCalled();
});
