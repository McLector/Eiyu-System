// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  oauth: { exchangeCodeForSession: vi.fn(), signInWithOAuth: vi.fn() },
  main: { getSession: vi.fn(), setSession: vi.fn(), signOut: vi.fn() },
}));

vi.mock('../../lib/supabase', () => ({ supabase: { auth: api.main } }));
vi.mock('../../lib/google-oauth', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/google-oauth')>()),
  getGoogleOAuthClient: () => api.oauth,
}));

import { resetGoogleCallbackMemory } from '../../lib/google-oauth';
import AuthCallbackPage from '../AuthCallbackPage';
import { GOOGLE_CANCELLED_MESSAGE, GOOGLE_GENERIC_MESSAGE, GOOGLE_LINK_REFUSED_MESSAGE } from '@eiyu/shared';

const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } };

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}|{JSON.stringify(location.state)}</output>;
}

function setup(entry: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth" element={<p>Sign-in destination</p>} />
          <Route path="/board" element={<p>Board destination</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  resetGoogleCallbackMemory();
  api.oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
  api.main.getSession.mockResolvedValue({ data: { session: null } });
  api.main.setSession.mockResolvedValue({ data: { session: SESSION }, error: null });
  api.main.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it('exchanges the code once under Strict Mode, hands over the session and leaves for the board', async () => {
  setup('/auth/callback?code=abc');
  expect(await screen.findByText('Board destination')).toBeInTheDocument();
  expect(api.oauth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  expect(api.oauth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  expect(api.main.setSession).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('location')).not.toHaveTextContent('code=');
});

it('shows a status while the exchange is pending', async () => {
  api.oauth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));
  setup('/auth/callback?code=abc');
  const status = await screen.findByText('Finishing sign-in…');
  expect(status).toHaveAttribute('role', 'status');
});

it('sends a refused link back to sign-in with the combined message and nothing else', async () => {
  setup('/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity');
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  const where = screen.getByTestId('location').textContent ?? '';
  expect(where).toContain(JSON.stringify(GOOGLE_LINK_REFUSED_MESSAGE).slice(1, -1));
  expect(where).not.toContain('Error creating identity');
  expect(api.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(api.main.setSession).not.toHaveBeenCalled();
});

it('marks a cancel as cancelled so sign-in can show a neutral line', async () => {
  setup('/auth/callback?error=access_denied');
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  const where = screen.getByTestId('location').textContent ?? '';
  expect(where).toContain(GOOGLE_CANCELLED_MESSAGE);
  expect(where).toContain('"cancelled":true');
});

it('treats a missing code as a failure and does not try an exchange', async () => {
  setup('/auth/callback');
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  expect(screen.getByTestId('location').textContent).toContain(GOOGLE_GENERIC_MESSAGE);
  expect(api.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
});

it('fails once on a replayed code, with no retry loop', async () => {
  api.oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('flow state not found') });
  setup('/auth/callback?code=old');
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  await waitFor(() => expect(api.oauth.exchangeCodeForSession).toHaveBeenCalledTimes(1));
  expect(api.main.setSession).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).not.toContain('flow state');
});
